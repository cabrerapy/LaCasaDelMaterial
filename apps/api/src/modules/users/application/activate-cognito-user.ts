import type { UserRepository } from '../domain/user.repository.js';
import { UserApplicationError } from './user-application-error.js';

export interface CognitoUserActivation {
  inspect(username: string): Promise<{ sub: string; confirmed: boolean }>;
  enable(username: string): Promise<void>;
  disable(username: string): Promise<void>;
}
export interface CognitoActivationLinks {
  findUserId(sub: string): Promise<string | null>;
  activateInactive(userId: string, sub: string, actorId: string): Promise<void>;
  deactivateAfterFailure(userId: string, actorId: string): Promise<void>;
}

// Not an HTTP endpoint or bootstrap. The caller must provide a current ADMIN.
export class ActivateCognitoUser {
  constructor(private readonly users: UserRepository,
    private readonly identities: CognitoUserActivation, private readonly links: CognitoActivationLinks) {}

  async execute(userId: string, actorId: string): Promise<{ userId: string; status: 'ACTIVE' }> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(userId) || !uuid.test(actorId)) throw new UserApplicationError('Identificador inválido', 400);
    const actor = await this.users.findById(actorId);
    if (actor?.role !== 'ADMIN' || actor.status !== 'ACTIVE') throw new UserApplicationError('Acceso denegado', 403);
    const user = await this.users.findById(userId);
    if (!user) throw new UserApplicationError('Usuario no encontrado', 404);
    if (user.status !== 'INACTIVE' || user.passwordHash !== '!COGNITO_ONLY') {
      throw new UserApplicationError('El usuario no está pendiente de activación Cognito', 409);
    }
    const identity = await this.identities.inspect(userId);
    if (!uuid.test(identity.sub) || !identity.confirmed || await this.links.findUserId(identity.sub) !== userId) {
      throw new UserApplicationError('Identidad no confirmada o vínculo inválido', 409);
    }
    try {
      await this.identities.enable(userId);
      // Conditional transaction, never overwrite a stale user/role snapshot.
      await this.links.activateInactive(userId, identity.sub, actorId);
    } catch (error: unknown) {
      const failures: unknown[] = [error];
      // Disable internal authorization too: an ambiguous commit may have succeeded,
      // and disabling Cognito alone does not invalidate every already-issued JWT.
      try { await this.links.deactivateAfterFailure(userId, actorId); }
      catch (compensation: unknown) { failures.push(compensation); }
      try { await this.identities.disable(userId); }
      catch (compensation: unknown) { failures.push(compensation); }
      if (failures.length > 1) throw new AggregateError(failures, 'Cognito activation requires reconciliation');
      throw error;
    }
    return { userId, status: 'ACTIVE' };
  }
}
