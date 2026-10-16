import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GetCommand, PutCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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

test('pending bootstrap profile is atomic with its reservation and cannot create ACTIVE or invent an internal actor', async () => {
  let transaction: TransactWriteCommand | undefined;
  const client = { send: async (command: TransactWriteCommand) => { transaction = command; } } as unknown as DynamoDBDocumentClient;
  const repository = new DynamoDbBootstrapReservation(client, 'offline-users', '123456789012');
  await repository.createPending(value, { name: 'Offline Admin', username: 'offline.admin', email: 'admin@example.invalid' });
  assert.equal(transaction?.input.ClientRequestToken, value.operationId);
  assert.equal(transaction?.input.TransactItems?.length, 2);
  const update = transaction?.input.TransactItems?.[0]?.Update;
  assert.ok(update?.ConditionExpression?.includes('attribute_not_exists(profileCreatedAt)'));
  assert.equal(update?.ExpressionAttributeValues?.[':operator'], value.operatorArn);
  const item = transaction?.input.TransactItems?.[1]?.Put?.Item;
  assert.equal(item?.['role'], 'ADMIN'); assert.equal(item?.['status'], 'INACTIVE');
  assert.equal(item?.['passwordHash'], '!COGNITO_ONLY'); assert.equal(item?.['createdBy'], undefined);
  assert.equal(item?.['bootstrapOperatorArn'], value.operatorArn);
  await assert.rejects(repository.createPending(value, { name: '', username: 'bad', email: 'invalid' }));
});

test('partial bootstrap inspection reads only its own inactive audited profile and never writes', async () => {
  const profile = { name: 'Offline Admin', username: 'offline.admin', email: 'admin@example.invalid' };
  const pending = { ...profile, id: value.userId, role: 'ADMIN', status: 'INACTIVE', passwordHash: '!COGNITO_ONLY',
    bootstrapOperationId: value.operationId, bootstrapOperatorArn: value.operatorArn, createdAt: value.createdAt };
  for (const change of [{}, { status: 'ACTIVE' }, { bootstrapOperationId: value.userId },
    { bootstrapOperatorArn: 'another' }, { passwordHash: 'local' }, { cognitoDeactivatedAt: value.createdAt }]) {
    const commands: GetCommand[] = [];
    const client = { send: async (command: GetCommand) => {
      assert.ok(command instanceof GetCommand); assert.equal(command.input.ConsistentRead, true);
      commands.push(command);
      return { Item: commands.length === 1 ? { ...value, state: 'RESERVED' } : { ...pending, ...change } };
    } } as unknown as DynamoDBDocumentClient;
    const repository = new DynamoDbBootstrapReservation(client, 'offline-users', '123456789012');
    if (Object.keys(change).length === 0) {
      assert.deepEqual(await repository.inspectPending(value.operationId, value.operatorArn), { reservation: value, profile });
    } else await assert.rejects(repository.inspectPending(value.operationId, value.operatorArn), /reconciliation/);
    assert.equal(commands.length, 2);
  }
});

test('bootstrap invitation reserves cooldown and checks inactive profile plus both links atomically', async () => {
  let command: TransactWriteCommand | undefined;
  const client = { send: async (input: TransactWriteCommand) => { command = input; } } as unknown as DynamoDBDocumentClient;
  const repository = new DynamoDbBootstrapReservation(client, 'offline-users', '123456789012');
  await repository.reserveInvitation(value, value.userId, value.createdAt);
  assert.equal(command?.input.TransactItems?.length, 4);
  const update = command?.input.TransactItems?.[0]?.Update;
  assert.equal(update?.ExpressionAttributeValues?.[':later'], '2026-10-12T00:05:00.000Z');
  assert.ok(update?.ConditionExpression?.includes('invitationNotBefore <= :now'));
  assert.ok(command?.input.TransactItems?.[1]?.ConditionCheck?.ConditionExpression?.includes('attribute_not_exists(cognitoDeactivatedAt)'));
  assert.equal(command?.input.TransactItems?.[2]?.ConditionCheck?.Key?.['id'], `COGNITO_SUB#${value.userId}`);
  await assert.rejects(repository.reserveInvitation(value, 'invalid', value.createdAt));
});

test('finalization atomically marks reservation finalized and audited profile active with exact email and links', async () => {
  let command: TransactWriteCommand | undefined;
  const client = { send: async (input: TransactWriteCommand) => { command = input; } } as unknown as DynamoDBDocumentClient;
  const repository = new DynamoDbBootstrapReservation(client, 'offline-users', '123456789012');
  await repository.finalize(value, value.userId, 'admin@example.invalid', value.createdAt);
  assert.equal(command?.input.TransactItems?.length, 4);
  const reservationUpdate = command?.input.TransactItems?.[0]?.Update;
  assert.equal(reservationUpdate?.ExpressionAttributeValues?.[':finalized'], 'FINALIZED');
  assert.ok(reservationUpdate?.ConditionExpression?.includes('attribute_exists(invitationRequestedAt)'));
  const profileUpdate = command?.input.TransactItems?.[1]?.Update;
  assert.equal(profileUpdate?.ExpressionAttributeValues?.[':active'], 'ACTIVE');
  assert.equal(profileUpdate?.ExpressionAttributeValues?.[':email'], 'admin@example.invalid');
  assert.ok(profileUpdate?.ConditionExpression?.includes('attribute_not_exists(cognitoDeactivatedAt)'));
  await assert.rejects(repository.finalize(value, value.userId, 'Invalid', value.createdAt));
});

test('ambiguous finalization recovery blocks its operation and internal profile atomically', async () => {
  let command: TransactWriteCommand | undefined;
  const client = { send: async (input: TransactWriteCommand) => { command = input; } } as unknown as DynamoDBDocumentClient;
  const repository = new DynamoDbBootstrapReservation(client, 'offline-users', '123456789012');
  await repository.blockAfterFinalizationFailure(value, value.createdAt);
  assert.equal(command?.input.TransactItems?.length, 2);
  const reservationUpdate = command?.input.TransactItems?.[0]?.Update;
  assert.equal(reservationUpdate?.ExpressionAttributeValues?.[':blocked'], 'RECONCILIATION_REQUIRED');
  assert.ok(reservationUpdate?.ConditionExpression?.includes('#state = :finalized'));
  assert.equal(reservationUpdate?.ExpressionAttributeValues?.[':operator'], value.operatorArn);
  const userUpdate = command?.input.TransactItems?.[1]?.Update;
  assert.equal(userUpdate?.ExpressionAttributeValues?.[':inactive'], 'INACTIVE');
  assert.ok(userUpdate?.ConditionExpression?.includes('bootstrapOperationId = :operation'));
  assert.equal(userUpdate?.ExpressionAttributeValues?.[':active'], undefined);
});
