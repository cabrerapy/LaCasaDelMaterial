import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDbCognitoLinkRepository } from './dynamodb-cognito-link.repository.js';
import { DynamoDbUserRepository } from './dynamodb-user.repository.js';
import { createCognitoUserResolver } from '../../auth/infrastructure/resolve-cognito-user.js';
import { InMemoryUserRepository } from './in-memory-user.repository.js';

const userId = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const sub = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
test('invitation reservation blocks concurrent and restarted callers until the five-minute boundary', async () => {
  let nowMs = Date.parse('2026-10-11T00:00:00.000Z');
  let notBefore: string | undefined;
  const actor = 'c2e086e2-47fd-4a56-90fd-3f9b772b0230';
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }));
  client.middlewareStack.add(() => async args => {
    const input = args.input as { TransactItems: Array<{ Update?: { ExpressionAttributeValues: Record<string, unknown> } }> };
    const values = input.TransactItems[0]?.Update?.ExpressionAttributeValues;
    assert.ok(values);
    const attemptAt = String(values[':now']);
    if (notBefore && notBefore > attemptAt) {
      throw new TransactionCanceledException({ $metadata: {}, message: 'condition',
        CancellationReasons: [{ Code: 'ConditionalCheckFailed' }] });
    }
    notBefore = String(values[':notBefore']);
    return { response: {}, output: { $metadata: {} } };
  }, { step: 'initialize', name: 'offlineConditionalModel' });
  const repository = () => new DynamoDbCognitoLinkRepository(client, 'offline-users', () => nowMs);
  try {
    const concurrent = await Promise.allSettled([
      repository().prepareInvitation(userId, sub, actor), repository().prepareInvitation(userId, sub, actor)
    ]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);
    nowMs += 299999;
    await assert.rejects(repository().prepareInvitation(userId, sub, actor), error =>
      error instanceof Error && 'statusCode' in error && error.statusCode === 409);
    nowMs++;
    await repository().prepareInvitation(userId, sub, actor);
    assert.equal(notBefore, '2026-10-11T00:10:00.000Z');
  } finally { client.destroy(); }
});

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

test('activation transaction protects inactive status, both links and current admin without overwriting role', async () => {
  const { links, client, commands } = fixture();
  const actor = 'c2e086e2-47fd-4a56-90fd-3f9b772b0230';
  try {
    await links.activateInactive(userId, sub, actor);
    const items = commands[0]?.['TransactItems'] as Array<{ Update?: {
      UpdateExpression: string; ConditionExpression: string; ExpressionAttributeValues: Record<string, unknown>
    }; ConditionCheck?: { Key: { id: string }; ConditionExpression: string } }>;
    assert.equal(items.length, 4);
    assert.equal(items[0]?.Update?.ConditionExpression, 'attribute_exists(username) AND #status = :inactive AND passwordHash = :cognito AND attribute_not_exists(cognitoDeactivatedAt)');
    assert.equal(items[0]?.Update?.ExpressionAttributeValues[':actor'], actor);
    assert.equal(items[0]?.Update?.UpdateExpression, 'SET #status = :active, updatedAt = :now, updatedBy = :actor');
    assert.equal(items[1]?.ConditionCheck?.Key.id, actor);
    assert.equal(items[1]?.ConditionCheck?.ConditionExpression, '#role = :admin AND #status = :active');
    assert.equal(items[2]?.ConditionCheck?.Key.id, `COGNITO_SUB#${sub}`);
    assert.equal(items[3]?.ConditionCheck?.Key.id, `COGNITO_USER#${userId}`);
    await assert.rejects(links.activateInactive(userId, sub, 'invalid'));
    assert.equal(commands.length, 1);
    await links.deactivateAfterFailure(userId, actor);
    assert.equal(commands[1]?.['UpdateExpression'], 'SET #status = :inactive, updatedAt = :now, updatedBy = :actor');
    assert.equal(commands[1]?.['ConditionExpression'], 'attribute_exists(username) AND passwordHash = :cognito');
    await links.prepareInvitation(userId, sub, actor);
    const invitation = commands[2]?.['TransactItems'] as typeof items;
    assert.equal(invitation.length, 4);
    assert.equal(invitation[0]?.Update?.ExpressionAttributeValues[':active'], 'INACTIVE');
    assert.equal(invitation[0]?.Update?.ExpressionAttributeValues[':actor'], actor);
    assert.equal(invitation[1]?.ConditionCheck?.Key.id, actor);
    assert.ok(invitation[0]?.Update?.ConditionExpression.includes('cognitoInvitationNotBefore <= :now'));
    assert.equal(Date.parse(String(invitation[0]?.Update?.ExpressionAttributeValues[':notBefore'])) -
      Date.parse(String(invitation[0]?.Update?.ExpressionAttributeValues[':now'])), 300000);
    assert.ok(invitation[0]?.Update?.UpdateExpression.includes('cognitoInvitationRequestedAt = :now'));
    assert.equal(typeof commands[2]?.['ClientRequestToken'], 'string');
    assert.equal(commands[1]?.['UpdateExpression']?.toString().includes('cognitoInvitation'), false);
    await links.deactivateNonAdmin(userId, sub, actor, 'Cambio de personal');
    const deactivation = commands[3]?.['TransactItems'] as typeof items;
    assert.equal(deactivation.length, 4);
    assert.ok(deactivation[0]?.Update?.ConditionExpression.includes('#role <> :admin'));
    assert.equal(deactivation[0]?.Update?.ExpressionAttributeValues[':reason'], 'Cambio de personal');
    assert.equal(deactivation[0]?.Update?.ExpressionAttributeValues[':inactive'], 'INACTIVE');
    assert.ok(deactivation[0]?.Update?.UpdateExpression.includes('cognitoDeactivatedAt = :now'));
    assert.ok(invitation[0]?.Update?.ConditionExpression.includes('attribute_not_exists(cognitoDeactivatedAt)'));
    await assert.rejects(links.deactivateNonAdmin(actor, sub, actor, 'Cambio de personal'));
  } finally { client.destroy(); }
});

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
