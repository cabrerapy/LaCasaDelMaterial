import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { createApp } from './create-app.js';
import { loadConfig } from '../config/environment.js';
import { Argon2PasswordHasher } from '../modules/auth/infrastructure/argon2-password-hasher.js';
import { LocalJwtAuthentication } from '../modules/auth/infrastructure/local-jwt-authentication.js';
import { InMemoryUserRepository } from '../modules/users/infrastructure/in-memory-user.repository.js';
import { bootstrapAdmin } from '../modules/auth/application/bootstrap-admin.js';
import { hasPermission } from '@lcm/contracts';

const adminPassword = 'LocalTestPassword123!';
const jwtSecret = 'test-secret-with-at-least-thirty-two-characters';
let app: FastifyInstance;
let users: InMemoryUserRepository;

before(async () => {
  users = new InMemoryUserRepository();
  const now = new Date().toISOString();
  await users.create({
    id: 'b052fa5e-e405-4460-82c8-6887137c885a',
    name: 'Administrador',
    username: 'admin',
    email: 'admin@lacasadelmaterial.local',
    passwordHash: await argon2.hash(adminPassword),
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  });
  await users.create({
    id: '50f4b568-e60a-4381-a7c3-c6d635c1b767',
    name: 'Caja',
    username: 'cashier',
    email: 'cashier@lacasadelmaterial.local',
    passwordHash: await argon2.hash(adminPassword),
    role: 'CASHIER',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    createdBy: 'b052fa5e-e405-4460-82c8-6887137c885a',
    updatedBy: 'b052fa5e-e405-4460-82c8-6887137c885a'
  });

  const config = loadConfig({
    NODE_ENV: 'test',
    INITIAL_ADMIN_PASSWORD: adminPassword,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: '8h'
  });
  app = await createApp(config, {
    users,
    passwordHasher: new Argon2PasswordHasher(),
    authentication: new LocalJwtAuthentication(config.jwtSecret, config.jwtExpiresIn)
  });
});

after(async () => {
  await app.close();
});

async function login(password = adminPassword, username = 'admin') {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password }
  });
}

test('GET /api/health remains public', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.statusCode, 200);
});

test('login succeeds with valid credentials', async () => {
  const response = await login();
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.username, 'admin');
  assert.equal(typeof response.json().accessToken, 'string');
});

test('login rejects an incorrect password with a generic message', async () => {
  const response = await login('incorrect-password');
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, 'Credenciales inválidas');
});

test('login rejects an unknown user with the same generic message', async () => {
  const response = await login(adminPassword, 'unknown');
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, 'Credenciales inválidas');
});

test('/auth/me returns the authenticated user', async () => {
  const accessToken = loginToken(await login());
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${accessToken}` }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().role, 'ADMIN');
  assert.equal(response.json().email, 'admin@lacasadelmaterial.local');
});

test('/auth/me rejects a missing token', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(response.statusCode, 401);
});

test('/auth/me rejects an invalid token', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: 'Bearer invalid-token' }
  });
  assert.equal(response.statusCode, 401);
});

test('/auth/me rejects an expired token', async () => {
  const expiredToken = jwt.sign(
    { role: 'ADMIN' },
    jwtSecret,
    { subject: 'b052fa5e-e405-4460-82c8-6887137c885a', expiresIn: -1 }
  );
  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${expiredToken}` }
  });
  assert.equal(response.statusCode, 401);
});

test('/auth/protected requires and accepts authentication', async () => {
  const unauthorized = await app.inject({ method: 'GET', url: '/api/auth/protected' });
  assert.equal(unauthorized.statusCode, 401);

  const accessToken = loginToken(await login());
  const authorized = await app.inject({
    method: 'GET',
    url: '/api/auth/protected',
    headers: { authorization: `Bearer ${accessToken}` }
  });
  assert.equal(authorized.statusCode, 200);
});

test('authentication responses never expose passwordHash', async () => {
  const loginResponse = await login();
  const accessToken = loginToken(loginResponse);
  const meResponse = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${accessToken}` }
  });

  assert.equal(loginResponse.body.includes('passwordHash'), false);
  assert.equal(meResponse.body.includes('passwordHash'), false);
});

test('admin bootstrap hashes the password and is idempotent', async () => {
  const users = new InMemoryUserRepository();
  const passwordHasher = new Argon2PasswordHasher();
  const logger = { info: () => undefined } as unknown as FastifyBaseLogger;

  await bootstrapAdmin(users, passwordHasher, adminPassword, logger);
  const created = await users.findByUsername('admin');
  assert.ok(created);
  assert.notEqual(created.passwordHash, adminPassword);
  assert.equal(await passwordHasher.verify(created.passwordHash, adminPassword), true);

  await bootstrapAdmin(users, passwordHasher, 'DifferentPassword123!', logger);
  const unchanged = await users.findByUsername('admin');
  assert.equal(unchanged?.passwordHash, created.passwordHash);
});

test('ADMIN can list users without exposing password hashes', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/users',
    headers: await authorizationHeader('admin')
  });
  assert.equal(response.statusCode, 200);
  assert.ok(response.json().items.length >= 2);
  assert.equal(response.body.includes('passwordHash'), false);
});

test('CASHIER receives 403 when listing users', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/users',
    headers: await authorizationHeader('cashier')
  });
  assert.equal(response.statusCode, 403);
});

test('an unauthenticated request receives 401 for users', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/users' });
  assert.equal(response.statusCode, 401);
});

test('ADMIN creates a user with a hashed password', async () => {
  const response = await createUser({
    name: 'Juan Pérez',
    username: 'juan',
    email: 'juan@example.com',
    password: 'InitialPassword123!',
    role: 'CASHIER'
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.includes('passwordHash'), false);
  const stored = await users.findByUsername('juan');
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, 'InitialPassword123!');
  assert.equal(await argon2.verify(stored.passwordHash, 'InitialPassword123!'), true);
});

test('duplicate username fails', async () => {
  const response = await createUser({
    name: 'Otro Juan',
    username: 'juan',
    email: 'otro-juan@example.com',
    password: 'InitialPassword123!',
    role: 'CASHIER'
  });
  assert.equal(response.statusCode, 409);
});

test('duplicate email fails', async () => {
  const response = await createUser({
    name: 'Email repetido',
    username: 'email-repetido',
    email: 'juan@example.com',
    password: 'InitialPassword123!',
    role: 'CASHIER'
  });
  assert.equal(response.statusCode, 409);
});

test('ADMIN can deactivate a user and the inactive user cannot log in', async () => {
  const created = await createUser({
    name: 'Usuario temporal',
    username: 'temporal',
    email: 'temporal@example.com',
    password: 'TemporaryPassword123',
    role: 'CASHIER'
  });
  const id = created.json().id as string;
  const statusResponse = await app.inject({
    method: 'PATCH',
    url: `/api/users/${id}/status`,
    headers: await authorizationHeader('admin'),
    payload: { status: 'INACTIVE' }
  });
  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.json().status, 'INACTIVE');

  const inactiveLogin = await login('TemporaryPassword123', 'temporal');
  assert.equal(inactiveLogin.statusCode, 401);
});

test('the last active ADMIN cannot be deactivated', async () => {
  const response = await app.inject({
    method: 'PATCH',
    url: '/api/users/b052fa5e-e405-4460-82c8-6887137c885a/status',
    headers: await authorizationHeader('admin'),
    payload: { status: 'INACTIVE' }
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().message, 'Debe existir al menos un administrador activo');
});

test('the centralized permission matrix separates ADMIN and CASHIER access', () => {
  assert.equal(hasPermission('ADMIN', 'users.read'), true);
  assert.equal(hasPermission('CASHIER', 'users.read'), false);
  assert.equal(hasPermission('CASHIER', 'sales.create'), true);
  assert.equal(hasPermission('DRIVER', 'products.costs.read'), false);
});

function loginToken(response: { json(): { accessToken: string } }): string {
  return response.json().accessToken;
}

async function authorizationHeader(username: string): Promise<{ authorization: string }> {
  return { authorization: `Bearer ${loginToken(await login(adminPassword, username))}` };
}

async function createUser(payload: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/api/users',
    headers: await authorizationHeader('admin'),
    payload
  });
}
