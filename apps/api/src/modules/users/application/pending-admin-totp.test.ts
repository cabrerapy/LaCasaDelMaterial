import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PendingAdminTotp } from './pending-admin-totp.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user.repository.js';
import type { User } from '../domain/user.js';
const id = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const sub = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
const time = Date.parse('2026-10-12T00:00:00Z');
async function fixture(options: { user?: Partial<User>; claims?: { sub: string; scope?: string; auth_time?: number };
  linked?: boolean; rejectToken?: boolean; enabled?: boolean; validCode?: boolean; failPreference?: boolean } = {}) {
  const users = new InMemoryUserRepository();
  await users.create({ id, username: 'qa.admin', email: 'qa@example.invalid', name: 'QA Admin',
    role: 'ADMIN', status: 'INACTIVE', passwordHash: '!COGNITO_ONLY',
    createdAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z', ...options.user });
  const calls: string[] = [];
  const service = new PendingAdminTotp({
    verify: async token => {
      assert.equal(token, 'offline-token');
      if (options.rejectToken) throw new Error('untrusted token');
      return options.claims ?? { sub, scope: 'openid aws.cognito.signin.user.admin', auth_time: time / 1000 };
    }
  }, users, { findUserId: async subject => { assert.equal(subject, sub); return options.linked === false ? null : id; } }, {
    enabled: async token => { assert.equal(token, 'offline-token'); calls.push('enabled'); return options.enabled ?? false; },
    associate: async () => { calls.push('associate'); return 'ABCDEFGHIJKLMNOP'; },
    verifyCode: async (_token, code) => { assert.equal(code, '123456'); calls.push('verify'); return options.validCode ?? true; },
    prefer: async () => { calls.push('prefer'); if (options.failPreference) throw new Error('preference failed'); }
  }, () => time);
  return { service, calls, users };
}
test('pending admin can configure TOTP but remains inactive without an application session', async () => {
  const { service, calls, users } = await fixture();
  assert.deepEqual(await service.begin('Bearer offline-token'), { secretCode: 'ABCDEFGHIJKLMNOP' });
  assert.deepEqual(await service.complete('Bearer offline-token', '123456'), { status: 'MFA_CONFIGURED_NOT_ACTIVE' });
  assert.deepEqual(calls, ['enabled', 'associate', 'enabled', 'verify', 'prefer']);
  assert.equal((await users.findById(id))?.status, 'INACTIVE');
});
test('invalid verification, missing scope, old/future sign-in and unlinked identities cannot enroll', async () => {
  for (const options of [{ rejectToken: true }, { linked: false },
    { claims: { sub, auth_time: time / 1000 } },
    { claims: { sub, scope: 'aws.cognito.signin.user.admin', auth_time: time / 1000 - 601 } },
    { claims: { sub, scope: 'aws.cognito.signin.user.admin', auth_time: time / 1000 + 1 } }]) {
    const { service, calls } = await fixture(options);
    await assert.rejects(service.begin('Bearer offline-token'));
    assert.deepEqual(calls, []);
  }
});
test('active, non-admin, local or deactivated users cannot use enrollment', async () => {
  for (const user of [{ status: 'ACTIVE' as const }, { role: 'CASHIER' as const },
    { passwordHash: 'local' }, { cognitoDeactivatedAt: '2026-10-12T00:00:00Z' }]) {
    const { service, calls } = await fixture({ user });
    await assert.rejects(service.begin('Bearer offline-token'));
    assert.deepEqual(calls, []);
  }
});
test('enabled TOTP cannot be replaced and enrollment completion does not reactivate anyone', async () => {
  const { service, calls } = await fixture({ enabled: true });
  await assert.rejects(service.begin('Bearer offline-token'), /ya está/);
  assert.equal((await service.complete('Bearer offline-token', '123456')).status, 'MFA_CONFIGURED_NOT_ACTIVE');
  assert.deepEqual(calls, ['enabled', 'enabled', 'prefer']);
});
test('code errors and partial preference failures never report completion', async () => {
  const invalid = await fixture({ validCode: false });
  await assert.rejects(invalid.service.complete('Bearer offline-token', '123456'), /no aceptado/);
  assert.equal(invalid.calls.includes('prefer'), false);
  await assert.rejects(invalid.service.complete('Bearer offline-token', '12'), /seis/);
  const partial = await fixture({ failPreference: true });
  await assert.rejects(partial.service.complete('Bearer offline-token', '123456'), /preference/);
  assert.equal((await partial.users.findById(id))?.status, 'INACTIVE');
  const alreadyEnabled = await fixture({ enabled: true, failPreference: true });
  await assert.rejects(alreadyEnabled.service.complete('Bearer offline-token', '123456'), /preference/);
  assert.equal((await alreadyEnabled.users.findById(id))?.status, 'INACTIVE');
});
