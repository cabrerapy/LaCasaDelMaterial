import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { AuthService } from '../../auth/application/auth.service.js';
import { AuthenticationError } from '../../auth/domain/authentication-error.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user.repository.js';
import { cognitoUsersRoutes } from './cognito-users.routes.js';
import { registerErrorHandler } from '../../../shared/error-handler.js';
import { usersRoutes } from './users.routes.js';
import { UsersService } from '../application/users.service.js';

const actorId = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const userId = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
const input = { name: 'QA', username: 'qa.user', email: 'qa@example.invalid', role: 'CASHIER' };
async function fixture(options: { cashier?: boolean; failure?: boolean; lifecycleEnabled?: boolean; local?: boolean; mfaFailure?: boolean } = {}) {
  const app = Fastify({ logger: false });
  const users = new InMemoryUserRepository();
  await users.create({ id: actorId, name: 'QA Admin', username: 'qa.admin', email: 'admin@example.invalid',
    passwordHash: '!COGNITO_ONLY', role: options.cashier ? 'CASHIER' : 'ADMIN', status: 'ACTIVE',
    createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z' });
  const auth = new AuthService(users, { hash: async () => { throw new Error('No password hashing'); },
    verify: async () => { throw new Error('No password verification'); } }, {
    supportsPasswordLogin: false, createToken: () => { throw new Error('No local tokens'); },
    authenticate: header => {
      if (header !== 'Bearer offline') throw new AuthenticationError();
      return { userId: actorId, role: 'ADMIN' }; // Current stored role must still govern.
    }
  });
  const calls: string[] = [];
  registerErrorHandler(app);
  await app.register(usersRoutes, { prefix: '/api/users', authService: auth,
    usersService: new UsersService(users, { hash: async () => { throw new Error('No hashing'); }, verify: async () => false }),
    readOnly: !options.local, cognitoLifecycleEnabled: options.lifecycleEnabled ?? true });
  await app.register(cognitoUsersRoutes, { prefix: '/api/users/cognito', authService: auth, lifecycle: {
    requireAdministratorMfa: async actor => {
      assert.equal(actor, actorId);
      if (options.mfaFailure) throw Object.assign(new Error('TOTP requerido'), { statusCode: 403 });
    },
    stage: { execute: async (body, actor) => {
      assert.equal(actor, actorId); assert.deepEqual(body, input); calls.push('stage');
      if (options.failure) throw new Error('Sensitive upstream secret');
      return { userId, status: 'INACTIVE' };
    } },
    invite: { execute: async (id, actor) => {
      assert.equal(id, userId); assert.equal(actor, actorId); calls.push('invite');
      return { userId, status: 'INACTIVE', invitation: 'REQUESTED' };
    } },
    activate: { execute: async (id, actor) => {
      assert.equal(id, userId); assert.equal(actor, actorId); calls.push('activate');
      return { userId, status: 'ACTIVE' };
    } },
    deactivate: { execute: async (id, actor, reason) => {
      assert.equal(id, userId); assert.equal(actor, actorId); assert.equal(reason, 'Cambio de personal');
      calls.push('deactivate'); return { userId, status: 'INACTIVE' };
    } }
  } });
  return { app, calls };
}
const requests = [
  { url: '/api/users/cognito', payload: input },
  { url: `/api/users/cognito/${userId}/invitation`, payload: {} },
  { url: `/api/users/cognito/${userId}/activation`, payload: {} },
  { url: `/api/users/cognito/${userId}/deactivation`, payload: { reason: 'Cambio de personal' } }
];
test('MFA failure blocks all Cognito lifecycle mutations', async () => {
  const { app, calls } = await fixture({ mfaFailure: true });
  try {
    for (const request of requests) {
      const response = await app.inject({ method: 'POST', ...request, headers: { authorization: 'Bearer offline' } });
      assert.equal(response.statusCode, 403);
    }
    assert.deepEqual(calls, []);
  } finally { await app.close(); }
});
test('capabilities expose local, enabled Cognito and disabled Cognito actions without secrets', async () => {
  for (const options of [{ local: true }, { lifecycleEnabled: true }, { lifecycleEnabled: false }]) {
    const { app } = await fixture(options);
    try {
      const response = await app.inject({ url: '/api/users/capabilities', headers: { authorization: 'Bearer offline' } });
      assert.equal(response.statusCode, 200);
      const local = 'local' in options;
      const enabled = !local && options.lifecycleEnabled === true;
      assert.deepEqual(response.json(), { mode: local ? 'local' : 'cognito', create: local || enabled,
        invite: enabled, activate: enabled, deactivate: enabled, edit: local, status: local });
      assert.equal((await app.inject({ url: '/api/users/capabilities' })).statusCode, 401);
    } finally { await app.close(); }
  }
});
test('Cognito routes stage, invite and activate with authenticated audit and no local password', async () => {
  const { app, calls } = await fixture();
  try {
    for (const [index, request] of requests.entries()) {
      const response = await app.inject({ method: 'POST', ...request, headers: { authorization: 'Bearer offline' } });
      assert.equal(response.statusCode, [201, 202, 200, 200][index]);
      assert.equal(response.json().userId, userId);
      assert.equal(response.json().password, undefined);
    }
    assert.deepEqual(calls, ['stage', 'invite', 'activate', 'deactivate']);
  } finally { await app.close(); }
});
test('Cognito administrative routes reject anonymous and current non-admin users', async () => {
  for (const cashier of [false, true]) {
    const { app, calls } = await fixture({ cashier });
    try {
      for (const request of requests) {
        const response = await app.inject({ method: 'POST', ...request,
          ...(cashier ? { headers: { authorization: 'Bearer offline' } } : {}) });
        assert.equal(response.statusCode, cashier ? 403 : 401);
      }
      assert.deepEqual(calls, []);
    } finally { await app.close(); }
  }
});
test('Cognito routes reject passwords, untrusted actor/status fields and invalid IDs before execution', async () => {
  const { app, calls } = await fixture();
  try {
    for (const request of [
      { url: '/api/users/cognito', payload: { ...input, password: 'NeverAccepted123!' } },
      { url: '/api/users/cognito', payload: { ...input, createdBy: userId } },
      { url: '/api/users/cognito', payload: { ...input, role: 'INVALID' } },
      { url: '/api/users/cognito/invalid/activation', payload: {} },
      { url: `/api/users/cognito/${userId}/invitation`, payload: { status: 'ACTIVE' } },
      { url: `/api/users/cognito/${userId}/deactivation`, payload: { reason: 'no' } }
    ]) {
      const response = await app.inject({ method: 'POST', ...request, headers: { authorization: 'Bearer offline' } });
      assert.equal(response.statusCode, 400);
    }
    assert.deepEqual(calls, []);
  } finally { await app.close(); }
});
test('upstream failures return generic errors without leaking Cognito details', async () => {
  const { app } = await fixture({ failure: true });
  try {
    const response = await app.inject({ method: 'POST', ...requests[0]!, headers: { authorization: 'Bearer offline' } });
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.includes('Sensitive'), false);
  } finally { await app.close(); }
});
