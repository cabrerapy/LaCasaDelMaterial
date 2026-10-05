import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DeleteTableCommand, DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { ensureTripLoadsTable } from '../../infrastructure/dynamodb/trip-loads-table.js';
import { DynamoDbTripLoadRepository } from './infrastructure/dynamodb-trip-load.repository.js';
import type { TripLoad } from './domain/trip-load.js';

test('real DynamoDB: concurrent loads cannot assign more than sold', async () => {
  assert.equal(process.env['DYNAMODB_TEST_ENDPOINT'], 'http://localhost:8000');
  const client = new DynamoDBClient({ endpoint: 'http://localhost:8000', region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const table = `lcm-test-loads-${randomUUID()}`;
  await ensureTripLoadsTable(client, table);
  try {
    const repo = new DynamoDbTripLoadRepository(DynamoDBDocumentClient.from(client), table);
    const saleId = randomUUID(), saleItemId = randomUUID(), now = new Date().toISOString();
    const makeLoad = (): TripLoad => ({ id: randomUUID(), tripId: randomUUID(), saleId, status: 'DRAFT', capacityValidation: 'PARTIAL', createdAt: now, updatedAt: now, createdBy: randomUUID(), updatedBy: randomUUID(), lines: [{ id: randomUUID(), saleItemId, productId: randomUUID(), productCode: 'QA', productName: 'QA', baseUnit: 'BAG', quantityScale: 1, quantityBaseInternal: 120 }] });
    const first = makeLoad(), second = makeLoad();
    await repo.saveDraft(first); await repo.saveDraft(second);
    const results = await Promise.allSettled([first, second].map(load => repo.confirm({ ...load, status: 'CONFIRMED' }, new Map([[saleItemId, 120]]), now)));
    const failed = results.find(result => result.status === 'rejected');
    if (results.every(result => result.status === 'rejected') && failed?.status === 'rejected') throw failed.reason;
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await repo.allocatedForSale(saleId)).get(saleItemId), 120);
    assert.deepEqual(await repo.verifyBalances(), []);
  } finally { await client.send(new DeleteTableCommand({ TableName: table })); client.destroy(); }
});

test('real DynamoDB: rebuild refuses stale versions after concurrent confirmation or cancellation', async () => {
  assert.equal(process.env['DYNAMODB_TEST_ENDPOINT'], 'http://localhost:8000');
  const options = { endpoint: 'http://localhost:8000', region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } };
  const client = new DynamoDBClient(options), writerClient = new DynamoDBClient(options);
  const table = `lcm-test-maintenance-${randomUUID()}`;
  await ensureTripLoadsTable(client, table);
  const c = DynamoDBDocumentClient.from(client), writer = new DynamoDbTripLoadRepository(DynamoDBDocumentClient.from(writerClient), table, table);
  const maintenance = new DynamoDbTripLoadRepository(c, table, table);
  try {
    const saleId = randomUUID(), saleItemId = randomUUID(), now = new Date().toISOString();
    const makeLoad = (quantity: number): TripLoad => ({ id: randomUUID(), tripId: randomUUID(), saleId, status: 'DRAFT', capacityValidation: 'PARTIAL', createdAt: now, updatedAt: now, createdBy: 'qa', updatedBy: 'qa', lines: [{ id: randomUUID(), saleItemId, productId: randomUUID(), productCode: 'QA', productName: 'QA', baseUnit: 'BAG', quantityScale: 1, quantityBaseInternal: quantity }] });
    const first = makeLoad(10), second = makeLoad(5);
    await writer.saveDraft(first); await writer.saveDraft(second);
    const confirmed = { ...first, status: 'CONFIRMED' as const };
    await writer.confirm(confirmed, new Map([[saleItemId, 120]]), now);
    for (const race of [
      () => writer.confirm({ ...second, status: 'CONFIRMED' }, new Map([[saleItemId, 120]]), now),
      () => writer.cancel({ ...confirmed, status: 'CANCELLED' }, now)
    ]) {
      let triggered = false;
      // Delay only the rebuild write. All reads, competing writes and CAS go to real DynamoDB.
      c.middlewareStack.add((next, context) => async args => {
        if (context.commandName?.startsWith('TransactWrite') && !triggered) {
          const tx = args.input as TransactWriteCommandInput;
          if (tx.TransactItems?.every(x => x.Put?.Item?.['entityType'] === 'DELIVERY_BALANCE')) { triggered = true; await race(); }
        }
        return next(args);
      }, { step: 'initialize', name: 'qaMaintenanceRace' });
      try { await assert.rejects(maintenance.rebuildBalances(), TransactionCanceledException); assert.equal(triggered, true); }
      finally { c.middlewareStack.remove('qaMaintenanceRace'); }
      assert.deepEqual(await maintenance.verifyBalances(), []);
    }
    assert.deepEqual(await writer.getBalance(saleId, saleItemId), { allocated: 5, delivered: 0 });
    await maintenance.rebuildBalances();
    assert.deepEqual(await writer.getBalance(saleId, saleItemId), { allocated: 5, delivered: 0 });
  } finally { await client.send(new DeleteTableCommand({ TableName: table })); client.destroy(); writerClient.destroy(); }
});
