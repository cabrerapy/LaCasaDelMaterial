import { randomUUID } from 'node:crypto';
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserResponse,
  UsersPageResponse,
  UserStatus
} from '@lcm/contracts';
import type { PasswordHasher } from '../../auth/application/password-hasher.js';
import type { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';
import { UserApplicationError } from './user-application-error.js';

export class UsersService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher
  ) {}

  async list(limit: number, nextToken?: string): Promise<UsersPageResponse> {
    const page = await this.users.list(limit, nextToken);
    return {
      items: page.items.map(toUserResponse),
      ...(page.nextToken ? { nextToken: page.nextToken } : {})
    };
  }

  async getById(id: string): Promise<UserResponse> {
    return toUserResponse(await this.requireUser(id));
  }

  async create(input: CreateUserRequest, actorId: string): Promise<UserResponse> {
    const username = input.username.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByUsername(username)) {
      throw new UserApplicationError('El username ya está en uso', 409);
    }
    if (await this.users.findByEmail(email)) {
      throw new UserApplicationError('El email ya está en uso', 409);
    }

    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      name: input.name.trim(),
      username,
      email,
      passwordHash: await this.passwordHasher.hash(input.password),
      role: input.role,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId
    };
    await this.users.create(user);
    return toUserResponse(user);
  }

  async update(id: string, input: UpdateUserRequest, actorId: string): Promise<UserResponse> {
    const current = await this.requireUser(id);
    const email = input.email?.trim().toLowerCase();
    if (email && email !== current.email) {
      const owner = await this.users.findByEmail(email);
      if (owner && owner.id !== current.id) {
        throw new UserApplicationError('El email ya está en uso', 409);
      }
    }
    if (
      current.role === 'ADMIN' &&
      current.status === 'ACTIVE' &&
      input.role &&
      input.role !== 'ADMIN'
    ) {
      await this.ensureAnotherActiveAdmin();
    }

    const updated: User = {
      ...current,
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(email ? { email } : {}),
      ...(input.role ? { role: input.role } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: actorId
    };
    await this.users.update(updated);
    return toUserResponse(updated);
  }

  async updateStatus(id: string, status: UserStatus, actorId: string): Promise<UserResponse> {
    const current = await this.requireUser(id);
    if (current.status === status) {
      return toUserResponse(current);
    }
    if (current.role === 'ADMIN' && current.status === 'ACTIVE' && status === 'INACTIVE') {
      await this.ensureAnotherActiveAdmin();
    }

    const updated: User = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId
    };
    await this.users.update(updated);
    return toUserResponse(updated);
  }

  private async requireUser(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new UserApplicationError('Usuario no encontrado', 404);
    }
    return user;
  }

  private async ensureAnotherActiveAdmin(): Promise<void> {
    if (await this.users.countActiveAdmins() <= 1) {
      throw new UserApplicationError('Debe existir al menos un administrador activo', 409);
    }
  }
}

function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
