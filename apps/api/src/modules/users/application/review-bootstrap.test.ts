import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewBootstrap } from './review-bootstrap.js';
import { reviewBootstrapResume } from './review-bootstrap-resume.js';
const target = { accountId: '123456789012', region: 'us-east-1', poolId: 'us-east-1_Offline', usersTable: 'offline-users' };
const operator = { account: target.accountId, arn: `arn:aws:iam::${target.accountId}:user/offline` };
const table = { arn: `arn:aws:dynamodb:us-east-1:${target.accountId}:table/offline-users`, status: 'ACTIVE',
  keySchema: [{ name: 'id', type: 'HASH' }], attributes: [{ name: 'id', type: 'S' }] };
const pool = { arn: `arn:aws:cognito-idp:us-east-1:${target.accountId}:userpool/${target.poolId}`, id: target.poolId };
test('review orders identity resources and all user pages without bootstrap writes', async () => {
  const calls: string[] = [];
  const result = await reviewBootstrap(target, async () => { calls.push('STS'); return operator; }, {
    table: async () => { calls.push('table'); return table; }, pool: async () => { calls.push('pool'); return pool; }
  }, { list: async (_limit, cursor) => { calls.push(cursor ?? 'users'); return cursor ? { items: [] } : { items: [], nextToken: 'next' }; } });
  assert.deepEqual(calls, ['STS', 'table', 'pool', 'users', 'next']);
  assert.equal(result.status, 'REVIEWED_NOT_BOOTSTRAPPED');
});
test('invalid identity blocks resource reads and invalid resources block user scans', async () => {
  let reads = 0;
  const resources = { table: async () => { reads++; return table; }, pool: async () => { reads++; return pool; } };
  const users = { list: async () => { reads++; return { items: [] }; } };
  await assert.rejects(reviewBootstrap(target, async () => ({ ...operator, arn: `arn:aws:iam::${target.accountId}:root` }), resources, users));
  assert.equal(reads, 0);
  await assert.rejects(reviewBootstrap(target, async () => operator, { ...resources, table: async () => ({}) }, users));
  assert.equal(reads, 0);
});

test('resume review accepts only inspected pending profile and rejects other profiles', async () => {
  const operation = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
  const user = { id: 'own', name: 'Offline', username: 'offline', email: 'offline@example.invalid',
    role: 'ADMIN' as const, status: 'INACTIVE' as const, passwordHash: '!COGNITO_ONLY', createdAt: '', updatedAt: '' };
  const resources = { table: async () => table, pool: async () => pool };
  const inspection = { inspectPending: async (id: string, arn: string) => {
    assert.equal(id, operation); assert.equal(arn, operator.arn); return { reservation: { userId: user.id } };
  } };
  assert.equal((await reviewBootstrapResume(target, operation, async () => operator, resources,
    { list: async () => ({ items: [user] }) }, inspection)).status, 'REVIEWED_NOT_BOOTSTRAPPED');
  await assert.rejects(reviewBootstrapResume(target, operation, async () => operator, resources,
    { list: async () => ({ items: [user, { ...user, id: 'other' }] }) }, inspection));
  await assert.rejects(reviewBootstrapResume(target, operation, async () => operator, resources,
    { list: async () => ({ items: [{ ...user, status: 'ACTIVE' }] }) }, inspection), /changed/);
});
