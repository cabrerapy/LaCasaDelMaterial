import { randomUUID } from 'node:crypto';
import { USER_ROLES, type CreateUserRequest } from '@lcm/contracts';
import type { UserRepository } from '../domain/user.repository.js';
import type { User } from '../domain/user.js';
import { UserApplicationError } from './user-application-error.js';

export interface CognitoUserProvisioning {
  createSuppressed(username: string, email: string, name: string): Promise<string>;
  disable(username: string): Promise<void>;
}

// Staging only: no activation, invitations, password issuance or local fallback.
export class StageCognitoUser {
  constructor(private readonly users: UserRepository,
    private readonly identities: CognitoUserProvisioning,
    private readonly links: { link(userId: string, sub: string): Promise<void> }) {}

  async execute(input: Omit<CreateUserRequest, 'password'>, actorId: string): Promise<{ userId: string; status: 'INACTIVE' }> {
    const username = input.username.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username) || input.name.trim().length < 2 || input.name.trim().length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !USER_ROLES.includes(input.role) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId)) {
      throw new UserApplicationError('Datos de usuario inválidos', 400);
    }
    if (await this.users.findByUsername(username) || await this.users.findByEmail(email)) {
      throw new UserApplicationError('Usuario o email ya está en uso', 409);
    }
    const now = new Date().toISOString();
    const user: User = { id: randomUUID(), name: input.name.trim(), username, email,
      role: input.role, status: 'INACTIVE', passwordHash: '!COGNITO_ONLY',
      createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId };
    await this.users.create(user);
    // Use the internal UUID, not a mutable email/username, for the Cognito name.
    try {
      const sub = await this.identities.createSuppressed(user.id, email, user.name);
      await this.identities.disable(user.id);
      await this.links.link(user.id, sub);
    } catch (error: unknown) {
      // Also handles ambiguous create timeouts: disable the generated identity name.
      try { await this.identities.disable(user.id); }
      catch (compensation: unknown) {
        throw new AggregateError([error, compensation], 'Cognito provisioning requires reconciliation');
      }
      throw error;
    }
    return { userId: user.id, status: 'INACTIVE' };
  }
}
