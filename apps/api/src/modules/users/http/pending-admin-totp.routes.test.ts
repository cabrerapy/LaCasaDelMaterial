import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { PendingAdminTotp } from '../application/pending-admin-totp.js';
import { pendingAdminTotpRoutes } from './pending-admin-totp.routes.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user.repository.js';
import { AuthService } from '../../auth/application/auth.service.js';
import { authRoutes } from '../../auth/http/auth.routes.js';
import { requirePermission } from '../../auth/http/authorization.js';
import { registerErrorHandler } from '../../../shared/error-handler.js';
import { API_LOGGER_OPTIONS } from '../../../app/create-app.js';
const id = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const sub = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
async function fixture(fail = false) {
  const users = new InMemoryUserRepository();
  await users.create({ id, name: 'QA', username: 'qa.admin', email: 'qa@example.invalid',
    role: 'ADMIN', status: 'INACTIVE', passwordHash: '!COGNITO_ONLY',
    createdAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z' });
  let captured = '';
  const stream = new Writable({ write(chunk: Buffer, _encoding, done) { captured += chunk.toString(); done(); } });
  const app = Fastify({ logger: { ...API_LOGGER_OPTIONS, stream } });
  registerErrorHandler(app);
  const calls: string[] = [];
  const enrollment = new PendingAdminTotp({
    verify: async token => {
      if (token !== 'offline-token') throw new Error('invalid');
      return { sub, scope: 'aws.cognito.signin.user.admin', auth_time: Math.floor(Date.now() / 1000) };
    }
  }, users, { findUserId: async () => id }, {
    enabled: async () => { calls.push('enabled'); return false; },
    associate: async () => { calls.push('associate'); if (fail) throw new Error('ABCDEFGHIJKLMNOP'); return 'ABCDEFGHIJKLMNOP'; },
    verifyCode: async () => { calls.push('verify'); return true; },
    prefer: async () => { calls.push('prefer'); }
  });
  await app.register(pendingAdminTotpRoutes, { prefix: '/api/auth/enrollment/totp', enrollment });
  const auth = new AuthService(users, { hash: async () => '', verify: async () => false }, {
    supportsPasswordLogin: false, createToken: () => '', authenticate: () => ({ userId: id, role: 'ADMIN' })
  });
  await app.register(authRoutes, { prefix: '/api/auth', authService: auth });
  let businessCalls = 0;
  app.get('/api/sales', { preHandler: requirePermission(auth, 'sales.read') }, () => { businessCalls++; return {}; });
  return { app, calls, users, logs: () => captured, businessCalls: () => businessCalls };
}
test('TOTP enrollment remains confidential and does not grant application access', async () => {
  const { app, users, logs, businessCalls } = await fixture();
  const headers = { authorization: 'Bearer offline-token' };
  try {
    const begin = await app.inject({ method: 'POST', url: '/api/auth/enrollment/totp/begin', headers, payload: {} });
    assert.equal(begin.statusCode, 200);
    assert.equal(begin.json().secretCode, 'ABCDEFGHIJKLMNOP');
    assert.equal(begin.headers['cache-control'], 'no-store');
    const complete = await app.inject({ method: 'POST', url: '/api/auth/enrollment/totp/complete', headers, payload: { code: '123456' } });
    assert.equal(complete.statusCode, 200);
    assert.equal(complete.headers['cache-control'], 'no-store');
    assert.equal(complete.json().status, 'MFA_CONFIGURED_NOT_ACTIVE');
    assert.equal(complete.headers['set-cookie'], undefined);
    assert.equal((await users.findById(id))?.status, 'INACTIVE');
    assert.equal((await app.inject({ url: '/api/auth/me', headers })).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/sales', headers })).statusCode, 401);
    assert.equal(businessCalls(), 0);
    for (const value of ['ABCDEFGHIJKLMNOP', 'offline-token', '123456']) assert.equal(logs().includes(value), false);
  } finally { await app.close(); }
});
test('missing or invalid token cannot invoke Cognito enrollment', async () => {
  const { app, calls } = await fixture();
  try {
    for (const authorization of ['', 'Bearer invalid']) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/enrollment/totp/begin',
        headers: { authorization }, payload: {} });
      assert.equal(response.statusCode, 401);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    assert.deepEqual(calls, []);
  } finally { await app.close(); }
});
test('enrollment rejects extra identity/token fields, query secrets and malformed codes', async () => {
  const { app, calls } = await fixture();
  try {
    for (const request of [
      { url: '/api/auth/enrollment/totp/begin', payload: { userId: id } },
      { url: '/api/auth/enrollment/totp/begin?code=123456', payload: {} },
      { url: '/api/auth/enrollment/totp/complete', payload: { code: '123456', AccessToken: 'extra' } },
      { url: '/api/auth/enrollment/totp/complete', payload: { code: 'bad' } }
    ]) {
      const response = await app.inject({ method: 'POST', ...request, headers: { authorization: 'Bearer offline-token' } });
      assert.equal(response.statusCode, 400);
    }
    assert.deepEqual(calls, []);
  } finally { await app.close(); }
});
test('upstream errors do not leak secrets and sensitive payloads have a bounded size', async () => {
  const { app, logs, calls } = await fixture(true);
  try {
    const response = await app.inject({ method: 'POST', url: '/api/auth/enrollment/totp/begin',
      headers: { authorization: 'Bearer offline-token' }, payload: {} });
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.includes('ABCDEFGHIJKLMNOP'), false);
    assert.equal(logs().includes('ABCDEFGHIJKLMNOP'), false);
    calls.length = 0;
    const oversized = await app.inject({ method: 'POST', url: '/api/auth/enrollment/totp/complete',
      headers: { authorization: 'Bearer offline-token' }, payload: { code: '1'.repeat(600) } });
    assert.equal(oversized.statusCode, 413);
    assert.deepEqual(calls, []);
  } finally { await app.close(); }
});
