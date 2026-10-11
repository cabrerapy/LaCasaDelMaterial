import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InviteCognitoUser } from './invite-cognito-user.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user.repository.js';

const userId = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const actorId = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
const sub = 'c2e086e2-47fd-4a56-90fd-3f9b772b0230';
async function fixture(options: { pending?: boolean; email?: string; failGuard?: boolean;
  failSend?: boolean; failEnable?: boolean; failRollback?: boolean; failDisable?: boolean; cashier?: boolean; active?: boolean } = {}) {
  const users = new InMemoryUserRepository();
  const base = { name: 'QA', email: 'qa@example.invalid', passwordHash: '!COGNITO_ONLY',
    createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z' };
  await users.create({ ...base, id: actorId, username: 'admin', role: options.cashier ? 'CASHIER' : 'ADMIN', status: 'ACTIVE' });
  await users.create({ ...base, id: userId, username: 'cashier', role: 'CASHIER', status: options.active ? 'ACTIVE' : 'INACTIVE' });
  const order: string[] = [];
  const service = new InviteCognitoUser(users, {
    inspect: async () => { order.push('inspect'); return { sub, email: options.email ?? base.email, passwordChangeRequired: options.pending ?? true }; },
    enable: async () => { order.push('enable'); if (options.failEnable) throw new Error('enable timeout'); },
    resendInvitation: async () => { order.push('resend'); if (options.failSend) throw new Error('mail timeout'); },
    disable: async () => { order.push('disable'); if (options.failDisable) throw new Error('disable failed'); }
  }, {
    prepareInvitation: async (id, subject, actor) => {
      assert.equal(id, userId); assert.equal(subject, sub); assert.equal(actor, actorId);
      order.push('prepare'); if (options.failGuard) throw new Error('condition failed');
    },
    deactivateAfterFailure: async () => { order.push('rollback'); if (options.failRollback) throw new Error('rollback failed'); }
  });
  return { users, service, order };
}
test('invitation requests password setup without activating application access', async () => {
  const { users, service, order } = await fixture();
  assert.deepEqual(await service.execute(userId, actorId), { userId, status: 'INACTIVE', invitation: 'REQUESTED' });
  assert.deepEqual(order, ['inspect', 'prepare', 'enable', 'resend']);
  assert.equal((await users.findById(userId))?.status, 'INACTIVE');
});
test('wrong email, completed password setup or failed transaction cannot send invitations', async () => {
  for (const options of [{ email: 'other@example.invalid' }, { pending: false }, { failGuard: true }]) {
    const { service, order } = await fixture(options);
    await assert.rejects(service.execute(userId, actorId));
    assert.equal(order.includes('enable'), false);
    assert.equal(order.includes('resend'), false);
    assert.equal(order.includes('disable'), false);
  }
});
test('non-admin and active targets are rejected before Cognito access', async () => {
  for (const options of [{ cashier: true }, { active: true }]) {
    const { service, order } = await fixture(options);
    await assert.rejects(service.execute(userId, actorId));
    assert.deepEqual(order, []);
  }
  const { service } = await fixture();
  await assert.rejects(service.execute('invalid', actorId), /Identificador/);
  await assert.rejects(service.execute(sub, actorId), /no encontrado/);
});
test('enable or email timeouts compensate both internal and Cognito authorization', async () => {
  for (const options of [{ failEnable: true }, { failSend: true }]) {
    const { service, order } = await fixture(options);
    await assert.rejects(service.execute(userId, actorId));
    assert.deepEqual(order.slice(-2), ['rollback', 'disable']);
  }
});
test('both compensations are attempted and failures require reconciliation', async () => {
  const { service, order } = await fixture({ failSend: true, failRollback: true, failDisable: true });
  await assert.rejects(service.execute(userId, actorId), error => error instanceof AggregateError && error.errors.length === 3);
  assert.deepEqual(order.slice(-2), ['rollback', 'disable']);
});
