import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StageCognitoUser } from './stage-cognito-user.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user.repository.js';

const input = { name: 'QA user', username: 'qa.user', email: 'qa@example.invalid', role: 'CASHIER' as const };
const sub = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const actor = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
test('Cognito staging remains inactive, audited and passwordless locally', async () => {
  const users = new InMemoryUserRepository();
  const order: string[] = [];
  const service = new StageCognitoUser(users, {
    createSuppressed: async username => { assert.equal((await users.findById(username))?.status, 'INACTIVE'); order.push('create'); return sub; },
    disable: async () => { order.push('disable'); }
  }, { link: async (id, subject) => { assert.equal(subject, sub); assert.ok(await users.findById(id)); order.push('link'); } });
  const result = await service.execute(input, actor);
  assert.deepEqual(order, ['create', 'disable', 'link']);
  const stored = await users.findById(result.userId);
  assert.equal(stored?.status, 'INACTIVE');
  assert.equal(stored?.createdBy, actor);
  assert.equal(stored?.passwordHash, '!COGNITO_ONLY');
  await assert.rejects(service.execute(input, actor), /ya está en uso/);
  await assert.rejects(service.execute({ ...input, username: '!!' }, actor), /inválidos/);
});

test('partial Cognito create or link failure triggers disable and never activates user', async () => {
  for (const failCreate of [true, false]) {
    const users = new InMemoryUserRepository();
    let disabled = 0;
    const service = new StageCognitoUser(users, {
      createSuppressed: async () => { if (failCreate) throw new Error('timeout'); return sub; },
      disable: async () => { disabled++; }
    }, { link: async () => { throw new Error('link failed'); } });
    await assert.rejects(service.execute(input, actor), failCreate ? /timeout/ : /link failed/);
    assert.equal(disabled, failCreate ? 1 : 2);
    assert.equal((await users.findByUsername(input.username))?.status, 'INACTIVE');
  }
});

test('failed compensation is reported for reconciliation without activating internal user', async () => {
  const users = new InMemoryUserRepository();
  const service = new StageCognitoUser(users, {
    createSuppressed: async () => { throw new Error('create timeout'); },
    disable: async () => { throw new Error('disable unavailable'); }
  }, { link: async () => undefined });
  await assert.rejects(service.execute(input, actor), AggregateError);
  assert.equal((await users.findByUsername(input.username))?.status, 'INACTIVE');
});
