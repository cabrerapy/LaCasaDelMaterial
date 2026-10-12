import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeactivateCognitoUser } from './deactivate-cognito-user.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user.repository.js';
import { AuthService } from '../../auth/application/auth.service.js';
import { UsersService } from './users.service.js';
const userId = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const actorId = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
const sub = 'c2e086e2-47fd-4a56-90fd-3f9b772b0230';
async function fixture(options: { admin?: boolean; local?: boolean; failCommit?: boolean; failDisable?: boolean; cashierActor?: boolean } = {}) {
  const users = new InMemoryUserRepository();
  const base = { name: 'QA', email: 'qa@example.invalid', passwordHash: '!COGNITO_ONLY',
    status: 'ACTIVE' as const, createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z' };
  await users.create({ ...base, id: actorId, username: 'admin', role: options.cashierActor ? 'CASHIER' : 'ADMIN' });
  await users.create({ ...base, id: userId, username: 'cashier', role: options.admin ? 'ADMIN' : 'CASHIER',
    passwordHash: options.local ? 'local-hash' : '!COGNITO_ONLY' });
  const order: string[] = [];
  const service = new DeactivateCognitoUser(users, {
    inspect: async () => { order.push('inspect'); return { sub }; },
    disable: async () => {
      order.push('disable');
      assert.equal((await users.findById(userId))?.status, 'INACTIVE');
      if (options.failDisable) throw new Error('Cognito timeout');
    }
  }, { deactivateNonAdmin: async (id, subject, actor, reason) => {
    assert.equal(id, userId); assert.equal(subject, sub); assert.equal(actor, actorId);
    assert.equal(reason, 'Cambio de personal'); order.push('commit');
    if (options.failCommit) throw new Error('DynamoDB failed');
    const user = await users.findById(id);
    assert.ok(user);
    await users.update({ ...user, status: 'INACTIVE', updatedBy: actor, cognitoDeactivatedAt: '2026-10-11T00:00:00Z' });
  } });
  return { service, users, order };
}
test('deactivation blocks the application before Cognito and allows repair retries', async () => {
  const { service, order, users } = await fixture();
  assert.deepEqual(await service.execute(userId, actorId, ' Cambio de personal '), { userId, status: 'INACTIVE' });
  assert.deepEqual(order, ['inspect', 'commit', 'disable']);
  const response = await new UsersService(users, { hash: async () => '', verify: async () => false }).getById(userId);
  assert.equal(response.cognitoDeactivated, true);
  assert.equal('cognitoDeactivationReason' in response, false);
  assert.equal('cognitoDeactivatedAt' in response, false);
  await service.execute(userId, actorId, 'Cambio de personal');
});
test('Cognito failure never restores access and already-issued tokens fail current-user authorization', async () => {
  const { service, users } = await fixture({ failDisable: true });
  const auth = new AuthService(users, { hash: async () => '', verify: async () => false }, {
    supportsPasswordLogin: false, createToken: () => '', authenticate: () => ({ userId, role: 'CASHIER' })
  });
  await auth.authenticate('Bearer existing-token');
  await assert.rejects(service.execute(userId, actorId, 'Cambio de personal'), AggregateError);
  assert.equal((await users.findById(userId))?.status, 'INACTIVE');
  await assert.rejects(auth.authenticate('Bearer existing-token'));
});
test('failed internal commit never disables Cognito', async () => {
  const { service, order } = await fixture({ failCommit: true });
  await assert.rejects(service.execute(userId, actorId, 'Cambio de personal'), /DynamoDB/);
  assert.deepEqual(order, ['inspect', 'commit']);
});
test('administrators, local targets and unauthorized actors cannot be deactivated', async () => {
  for (const options of [{ admin: true }, { local: true }, { cashierActor: true }]) {
    const { service, order } = await fixture(options);
    await assert.rejects(service.execute(userId, actorId, 'Cambio de personal'));
    assert.deepEqual(order, []);
  }
  const { service } = await fixture();
  await assert.rejects(service.execute(actorId, actorId, 'Cambio de personal'), /administradores/);
  await assert.rejects(service.execute(userId, actorId, 'no'), /motivo/);
  await assert.rejects(service.execute(sub, actorId, 'Cambio de personal'), /no encontrado/);
});
