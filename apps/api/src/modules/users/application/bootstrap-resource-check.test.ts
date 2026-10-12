import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBootstrapResources, type BootstrapResourceReader } from './bootstrap-resource-check.js';
const target = { accountId: '123456789012', region: 'us-east-1', poolId: 'us-east-1_Offline', usersTable: 'offline-users' };
const table = { arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/offline-users', status: 'ACTIVE',
  keySchema: [{ name: 'id', type: 'HASH' }], attributes: [{ name: 'id', type: 'S' }] };
const pool = { arn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_Offline', id: target.poolId };
test('resource check accepts only exact account region names and Users primary key', async () => {
  await checkBootstrapResources(target, { table: async () => table, pool: async () => pool });
});
test('resource check fails closed for wrong owner schema status or missing resources', async () => {
  let poolReads = 0;
  for (const invalid of [{}, { ...table, arn: table.arn.replace('123456789012', '999999999999') },
    { ...table, status: 'CREATING' }, { ...table, keySchema: [{ name: 'pk', type: 'HASH' }] }]) {
    await assert.rejects(checkBootstrapResources(target, { table: async () => invalid,
      pool: async () => { poolReads++; return pool; } }));
  }
  assert.equal(poolReads, 0);
  for (const invalid of [{}, { ...pool, id: 'other' }, { ...pool, arn: pool.arn.replace('us-east-1:', 'us-east-2:') }]) {
    await assert.rejects(checkBootstrapResources(target, { table: async () => table, pool: async () => invalid }));
  }
  const failed: BootstrapResourceReader = { table: async () => { throw new Error('denied'); }, pool: async () => pool };
  await assert.rejects(checkBootstrapResources(target, failed), /denied/);
});

test('resource check rejects missing numeric binary and duplicate id definitions before reading pool', async () => {
  let poolReads = 0;
  for (const attributes of [undefined, [], [{ name: 'id', type: 'N' }], [{ name: 'id', type: 'B' }],
    [{ name: 'id', type: 'S' }, { name: 'id', type: 'N' }]]) {
    await assert.rejects(checkBootstrapResources(target, { table: async () => ({ ...table, attributes }),
      pool: async () => { poolReads++; return pool; } }));
  }
  assert.equal(poolReads, 0);
  await checkBootstrapResources(target, { table: async () => ({ ...table,
    attributes: [...table.attributes, { name: 'username', type: 'S' }] }), pool: async () => pool });
});
