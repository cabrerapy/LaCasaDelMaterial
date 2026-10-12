import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDbBootstrapReservation } from './dynamodb-bootstrap-reservation.js';
const value = { operationId: 'a2e086e2-47fd-4a56-90fd-3f9b772b0230',
  userId: 'b2e086e2-47fd-4a56-90fd-3f9b772b0230',
  operatorArn: 'arn:aws:iam::123456789012:user/offline-admin', createdAt: '2026-10-12T00:00:00.000Z' };

test('bootstrap uses a permanent conditional singleton and strong same-operator resume', async () => {
  const commands: (PutCommand | GetCommand)[] = [];
  const client = { send: async (command: PutCommand | GetCommand) => {
    commands.push(command); return { Item: { ...value, state: 'RESERVED' } };
  } } as unknown as DynamoDBDocumentClient;
  const reservation = new DynamoDbBootstrapReservation(client, 'offline-users', '123456789012');
  await reservation.reserve(value);
  assert.equal((commands[0]!.input as PutCommand['input']).ConditionExpression, 'attribute_not_exists(id)');
  assert.equal((commands[0]!.input as PutCommand['input']).Item?.['id'], 'BOOTSTRAP#FIRST_ADMIN');
  assert.deepEqual(await reservation.resume(value.operationId, value.operatorArn), value);
  assert.equal((commands[1]!.input as GetCommand['input']).ConsistentRead, true);
  await assert.rejects(reservation.resume(value.userId, value.operatorArn));
  await assert.rejects(reservation.resume(value.operationId, 'arn:aws:iam::123456789012:user/another'));
});
test('bootstrap rejects root, wrong account and invalid identifiers before writes', async () => {
  let calls = 0;
  const client = { send: async () => { calls++; } } as unknown as DynamoDBDocumentClient;
  const reservation = new DynamoDbBootstrapReservation(client, 'offline-users', '123456789012');
  for (const invalid of [{ ...value, operatorArn: 'arn:aws:iam::123456789012:root' },
    { ...value, operatorArn: 'arn:aws:iam::999999999999:user/admin' }, { ...value, userId: 'invalid' }]) {
    await assert.rejects(reservation.reserve(invalid));
  }
  assert.equal(calls, 0);
});
