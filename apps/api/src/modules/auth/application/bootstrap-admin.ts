import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { UserRepository } from '../../users/domain/user.repository.js';
import type { PasswordHasher } from './password-hasher.js';

export async function bootstrapAdmin(
  users: UserRepository,
  passwordHasher: PasswordHasher,
  initialPassword: string,
  logger: FastifyBaseLogger
): Promise<void> {
  const existing = await users.findByUsername('admin');
  if (existing) {
    logger.info({ userId: existing.id }, 'Admin bootstrap already exists');
    return;
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  await users.create({
    id,
    name: 'Administrador',
    username: 'admin',
    email: 'admin@lacasadelmaterial.local',
    passwordHash: await passwordHasher.hash(initialPassword),
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    createdBy: id,
    updatedBy: id
  });
  logger.info({ userId: id }, 'Admin bootstrap created');
}
