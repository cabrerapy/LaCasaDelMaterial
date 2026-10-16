import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootstrapPreflight } from './bootstrap-preflight.js';
import type { User } from '../domain/user.js';
const target = { accountId: '123456789012', region: 'us-east-1', poolId: 'us-east-1_Offline', usersTable: 'offline-users' };
const identity = { account: target.accountId, arn: 'arn:aws:iam::123456789012:user/offline-admin' };
test('preflight checks identity before traversing all user pages including empty pages', async () => {
  const calls: string[] = [];
  assert.deepEqual(await bootstrapPreflight(target, async () => { calls.push('identity'); return identity; }, {
    list: async (_limit, cursor) => { calls.push(cursor ?? 'first'); return cursor ? { items: [] } : { items: [], nextToken: 'next' }; }
  }), identity);
  assert.deepEqual(calls, ['identity', 'first', 'next']);
});
test('preflight rejects root, foreign identity and invalid target before scanning users', async () => {
  let reads = 0;
  const users = { list: async () => { reads++; return { items: [] }; } };
  for (const caller of [{ ...identity, arn: 'arn:aws:iam::123456789012:root' }, { ...identity, account: '999999999999' }]) {
    await assert.rejects(bootstrapPreflight(target, async () => caller, users));
  }
  await assert.rejects(bootstrapPreflight({ ...target, region: 'us-east-2' }, async () => identity, users));
  assert.equal(reads, 0);
});
test('preflight rejects inactive admins too, repeated cursors and incomplete traversal', async () => {
  const admin: User = { id: 'offline', name: 'Offline', username: 'offline', email: 'offline@example.invalid',
    role: 'ADMIN', status: 'INACTIVE', passwordHash: '!COGNITO_ONLY', createdAt: '', updatedAt: '' };
  await assert.rejects(bootstrapPreflight(target, async () => identity, { list: async () => ({ items: [admin] }) }), /Existing/);
  await assert.rejects(bootstrapPreflight(target, async () => identity, {
    list: async () => ({ items: [{ ...admin, role: 'CASHIER' }] })
  }), /without existing user profiles/);
  await assert.rejects(bootstrapPreflight(target, async () => identity, {
    list: async () => ({ items: [], nextToken: 'same' })
  }), /Repeated/);
  let pages = 0;
  await assert.rejects(bootstrapPreflight(target, async () => identity, {
    list: async () => ({ items: [], nextToken: String(++pages) })
  }), /limit/);
  assert.equal(pages, 100);
});
