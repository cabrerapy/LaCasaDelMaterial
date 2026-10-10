import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDbCognitoLinkRepository } from './dynamodb-cognito-link.repository.js';
import { DynamoDbUserRepository } from './dynamodb-user.repository.js';
import { createCognitoUserResolver } from '../../auth/infrastructure/resolve-cognito-user.js';
import { InMemoryUserRepository } from './in-memory-user.repository.js';

const userId = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const sub = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
function fixture(outputs: Record<string, unknown>[] = []) {
  const commands: Record<string, unknown>[] = [];
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }));
  client.middlewareStack.add(() => async args => {
    commands.push(args.input as Record<string, unknown>);
    return { response: {}, output: { $metadata: {}, ...outputs.shift() } };
  }, { step: 'initialize', name: 'offlineCapture' });
  return { client, commands, links: new DynamoDbCognitoLinkRepository(client, 'offline-users') };
}

test('link writes two conditional reservations and user existence check in one transaction', async () => {
  const { links, client, commands } = fixture();
  try {
    await links.link(userId, sub);
    assert.equal(commands.length, 1);
    const items = commands[0]?.['TransactItems'] as Array<{ Put?: { Item: { id: string }; ConditionExpression: string }; ConditionCheck?: { Key: { id: string } } }>;
    assert.equal(items.length, 3);
    assert.equal(items[0]?.ConditionCheck?.Key.id, userId);
    assert.equal(items[1]?.Put?.Item.id, `COGNITO_SUB#${sub}`);
    assert.equal(items[2]?.Put?.Item.id, `COGNITO_USER#${userId}`);
    for (const item of items.slice(1)) assert.equal(item.Put?.ConditionExpression, 'attribute_not_exists(id) OR (userId = :user AND sub = :sub)');
    await assert.rejects(links.link('invalid', sub), /Invalid/);
    assert.equal(commands.length, 1);
  } finally { client.destroy(); }
});

test('resolve requires both directions and uses strongly consistent reads', async () => {
  for (const reverse of [{ userId, sub }, { userId, sub: userId }, undefined]) {
    const { links, client, commands } = fixture([{ Item: { userId, sub } }, ...(reverse ? [{ Item: reverse }] : [{}])]);
    try {
      assert.equal(await links.findUserId(sub), reverse?.sub === sub ? userId : null);
      assert.equal(commands.length, 2);
      assert.ok(commands.every(command => command['ConsistentRead'] === true));
    } finally { client.destroy(); }
  }
});

test('user listing excludes reservations while preserving cursor and empty pages', async () => {
  const { client, commands } = fixture([{ Items: [], LastEvaluatedKey: { id: `COGNITO_SUB#${sub}` } }]);
  try {
    const page = await new DynamoDbUserRepository(client, 'offline-users').list(10);
    assert.deepEqual(page.items, []);
    assert.ok(page.nextToken);
    assert.equal(commands[0]?.['FilterExpression'], 'attribute_exists(username)');
  } finally { client.destroy(); }
});

test('resolver obtains current application role/status, not email or token groups', async () => {
  const users = new InMemoryUserRepository();
  const user = { id: userId, name: 'QA', username: 'qa', email: 'qa@example.invalid', passwordHash: 'unused',
    role: 'CASHIER' as const, status: 'ACTIVE' as const, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
  await users.create(user);
  const resolver = createCognitoUserResolver({ findUserId: async () => userId }, users);
  assert.deepEqual(await resolver(sub), { id: userId, cognitoSub: sub, role: 'CASHIER', status: 'ACTIVE' });
  await users.update({ ...user, status: 'INACTIVE' });
  assert.equal((await resolver(sub))?.status, 'INACTIVE');
  assert.equal(await createCognitoUserResolver({ findUserId: async () => null }, users)(sub), null);
});
