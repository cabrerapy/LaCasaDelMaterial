import type { UserRepository } from '../domain/user.repository.js';
import { UserApplicationError } from './user-application-error.js';

export class DeactivateCognitoUser {
  constructor(private readonly users: UserRepository,
    private readonly identities: { inspect(id: string): Promise<{ sub: string }>; disable(id: string): Promise<void> },
    private readonly links: { deactivateNonAdmin(id: string, sub: string, actor: string, reason: string): Promise<void> }) {}

  async execute(userId: string, actorId: string, reason: string): Promise<{ userId: string; status: 'INACTIVE' }> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const note = reason.trim();
    if (!uuid.test(userId) || !uuid.test(actorId) || note.length < 5 || note.length > 500) {
      throw new UserApplicationError('Identificador o motivo inválido', 400);
    }
    const actor = await this.users.findById(actorId);
    if (actor?.role !== 'ADMIN' || actor.status !== 'ACTIVE') throw new UserApplicationError('Acceso denegado', 403);
    const user = await this.users.findById(userId);
    if (!user) throw new UserApplicationError('Usuario no encontrado', 404);
    if (user.role === 'ADMIN' || userId === actorId) {
      throw new UserApplicationError('La desactivación de administradores requiere un procedimiento separado.', 409);
    }
    if (user.passwordHash !== '!COGNITO_ONLY') throw new UserApplicationError('El usuario no es Cognito', 409);
    const identity = await this.identities.inspect(userId);
    if (!uuid.test(identity.sub)) throw new UserApplicationError('Vínculo inválido', 409);
    // Blocks application authorization first, even for already-issued JWTs.
    await this.links.deactivateNonAdmin(userId, identity.sub, actorId, note);
    try { await this.identities.disable(userId); }
    catch (error: unknown) {
      // Never restore ACTIVE after an ambiguous Cognito failure.
      throw new AggregateError([error], 'User blocked internally; Cognito disable requires reconciliation');
    }
    return { userId, status: 'INACTIVE' };
  }
}
