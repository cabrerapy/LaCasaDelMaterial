import type { UserRepository } from '../domain/user.repository.js';
import { UserApplicationError } from './user-application-error.js';

export interface CognitoUserInvitation {
  inspect(username: string): Promise<{ sub: string; email: string; passwordChangeRequired: boolean }>;
  enable(username: string): Promise<void>;
  resendInvitation(username: string): Promise<void>;
  disable(username: string): Promise<void>;
}
export interface CognitoInvitationLinks {
  prepareInvitation(userId: string, sub: string, actorId: string): Promise<void>;
  deactivateAfterFailure(userId: string, actorId: string): Promise<void>;
}

// Enabling Cognito permits password setup, NOT access to the application.
// Invitations are explicit attempts, not automatically retried/idempotent email delivery.
export class InviteCognitoUser {
  constructor(private readonly users: UserRepository,
    private readonly identities: CognitoUserInvitation, private readonly links: CognitoInvitationLinks) {}

  async execute(userId: string, actorId: string): Promise<{ userId: string; status: 'INACTIVE'; invitation: 'REQUESTED' }> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(userId) || !uuid.test(actorId)) throw new UserApplicationError('Identificador inválido', 400);
    const actor = await this.users.findById(actorId);
    if (actor?.role !== 'ADMIN' || actor.status !== 'ACTIVE') throw new UserApplicationError('Acceso denegado', 403);
    const user = await this.users.findById(userId);
    if (!user) throw new UserApplicationError('Usuario no encontrado', 404);
    if (user.status !== 'INACTIVE' || user.passwordHash !== '!COGNITO_ONLY') {
      throw new UserApplicationError('El usuario no está pendiente de invitación Cognito', 409);
    }
    const identity = await this.identities.inspect(userId);
    if (!uuid.test(identity.sub) || !identity.passwordChangeRequired ||
      identity.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      throw new UserApplicationError('Identidad o correo no válido para invitación', 409);
    }
    // Atomically check both links and current ADMIN; remain INACTIVE, audit attempt.
    await this.links.prepareInvitation(userId, identity.sub, actorId);
    try {
      await this.identities.enable(userId);
      await this.identities.resendInvitation(userId);
    } catch (error: unknown) {
      const failures: unknown[] = [error];
      try { await this.links.deactivateAfterFailure(userId, actorId); }
      catch (compensation: unknown) { failures.push(compensation); }
      try { await this.identities.disable(userId); }
      catch (compensation: unknown) { failures.push(compensation); }
      if (failures.length > 1) throw new AggregateError(failures, 'Cognito invitation requires reconciliation');
      throw error;
    }
    return { userId, status: 'INACTIVE', invitation: 'REQUESTED' };
  }
}
