import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivateCognitoUser } from './activate-cognito-user.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user.repository.js';
import type { User } from '../domain/user.js';

const userId = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const actorId = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
const sub = 'c2e086e2-47fd-4a56-90fd-3f9b772b0230';
async function fixture(options: { confirmed?: boolean; linked?: boolean; failEnable?: boolean;
  failCommit?: boolean; failDisable?: boolean; failRollback?: boolean; actorRole?: User['role']; actorStatus?: User['status'];
  targetStatus?: User['status']; local?: boolean } = {}) {
  const users = new InMemoryUserRepository();
  const base = { name: 'QA', email: 'qa@example.invalid', passwordHash: '!COGNITO_ONLY',
    createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z' };
  await users.create({ ...base, id: actorId, username: 'admin', role: options.actorRole ?? 'ADMIN', status: options.actorStatus ?? 'ACTIVE' });
  await users.create({ ...base, id: userId, username: 'cashier', role: 'CASHIER',
    status: options.targetStatus ?? 'INACTIVE', passwordHash: options.local ? 'local-hash' : '!COGNITO_ONLY' });
  const order: string[] = [];
  const service = new ActivateCognitoUser(users, {
    inspect: async () => { order.push('inspect'); return { sub, confirmed: options.confirmed ?? true }; },
    enable: async () => { order.push('enable'); if (options.failEnable) throw new Error('enable timeout'); },
    disable: async () => { order.push('disable'); if (options.failDisable) throw new Error('disable failed'); }
  }, {
    findUserId: async () => options.linked === false ? null : userId,
    deactivateAfterFailure: async () => { order.push('rollback'); if (options.failRollback) throw new Error('rollback failed'); },
    activateInactive: async (id, subject, actor) => {
      assert.equal(id, userId); assert.equal(subject, sub); assert.equal(actor, actorId);
      order.push('commit');
      if (options.failCommit) throw new Error('commit failed');
    }
  });
  return { users, service, order };
}
test('activation requires a confirmed linked identity and commits after enable', async () => {
  const { service, order } = await fixture();
  assert.deepEqual(await service.execute(userId, actorId), { userId, status: 'ACTIVE' });
  assert.deepEqual(order, ['inspect', 'enable', 'commit']);
});
test('unconfirmed or unlinked identities cannot be enabled', async () => {
  for (const options of [{ confirmed: false }, { linked: false }]) {
    const { service, order } = await fixture(options);
    await assert.rejects(service.execute(userId, actorId), /Identidad/);
    assert.deepEqual(order, ['inspect']);
  }
});
test('non-admin, inactive actors, local or already-active targets cannot activate', async () => {
  for (const options of [{ actorRole: 'CASHIER' as const }, { actorStatus: 'INACTIVE' as const },
    { local: true }, { targetStatus: 'ACTIVE' as const }]) {
    const { service, order } = await fixture(options);
    await assert.rejects(service.execute(userId, actorId));
    assert.deepEqual(order, []);
  }
  const { service, order } = await fixture();
  await assert.rejects(service.execute('invalid', actorId), /Identificador/);
  await assert.rejects(service.execute(sub, actorId), /no encontrado/);
  assert.deepEqual(order, []);
});
test('ambiguous enable and conditional commit failures disable the identity', async () => {
  for (const options of [{ failEnable: true }, { failCommit: true }]) {
    const { service, order } = await fixture(options);
    await assert.rejects(service.execute(userId, actorId));
    assert.equal(order.at(-1), 'disable');
    assert.equal(order.at(-2), 'rollback');
  }
});
test('failed compensation is surfaced for reconciliation', async () => {
  const { service } = await fixture({ failCommit: true, failDisable: true });
  await assert.rejects(service.execute(userId, actorId), AggregateError);
  const failedRollback = await fixture({ failCommit: true, failRollback: true });
  await assert.rejects(failedRollback.service.execute(userId, actorId), AggregateError);
  assert.equal(failedRollback.order.at(-1), 'disable');
});
