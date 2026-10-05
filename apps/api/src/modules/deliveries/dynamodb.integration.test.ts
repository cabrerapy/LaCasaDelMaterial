import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DeleteTableCommand, DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { ensureTripsTable } from '../../infrastructure/dynamodb/trips-table.js';
import { DynamoDbTripRepository, item } from '../trips/infrastructure/dynamodb-trip.repository.js';
import { DynamoDbDeliveryRepository } from './infrastructure/dynamodb-delivery.repository.js';
import { DeliveryConflictError } from './domain/delivery.repository.js';
import type { DeliveryReceipt } from './domain/delivery.js';
import type { Trip } from '../trips/domain/trip.js';
import type { Truck } from '../trucks/domain/truck.js';
import type { TripLoad } from '../trip-loads/domain/trip-load.js';
import { DynamoDbTripLoadRepository } from '../trip-loads/infrastructure/dynamodb-trip-load.repository.js';
import { TripLoadConflictError } from '../trip-loads/domain/trip-load.repository.js';

test('real DynamoDB: concurrent partial confirmations deliver once and preserve trip index', async () => {
  assert.equal(process.env['DYNAMODB_TEST_ENDPOINT'], 'http://localhost:8000');
  const client = new DynamoDBClient({ endpoint: 'http://localhost:8000', region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const table = `lcm-test-deliveries-${randomUUID()}`;
  await ensureTripsTable(client, table);
  const c = DynamoDBDocumentClient.from(client);
  try {
    const now = '2026-10-04T10:00:00Z', later = '2026-10-04T11:00:00Z';
    const trip: Trip = { id: randomUUID(), tripNumber: 'QA-TRIP', truckId: randomUUID(), truckLabel: 'QA', driverId: randomUUID(), driverName: 'QA', saleId: randomUUID(), originName: 'QA', destinationName: 'QA', destinationAddress: 'Local', status: 'IN_TRANSIT', scheduledDate: '2026-10-04', freightChargeGuarani: 0, createdAt: now, updatedAt: now, createdBy: 'qa', updatedBy: 'qa' };
    const saleId = trip.saleId!;
    const truck: Truck = { id: trip.truckId, plate: 'QA', brand: 'QA', vehicleType: 'TRUCK', fuelType: 'DIESEL', currentOdometerKm: 1000, status: 'ACTIVE', normalizedSearch: 'qa', createdAt: now, updatedAt: now, createdBy: 'qa', updatedBy: 'qa' };
    const saleItemId = randomUUID(), productId = randomUUID(), loadLineId = randomUUID();
    const load: TripLoad = { id: randomUUID(), tripId: trip.id, saleId, status: 'CONFIRMED', capacityValidation: 'PARTIAL', createdAt: now, updatedAt: now, createdBy: 'qa', updatedBy: 'qa', lines: [{ id: loadLineId, saleItemId, productId, productCode: 'QA', productName: 'QA', baseUnit: 'BAG', quantityScale: 1, quantityBaseInternal: 120 }] };
    const id = randomUUID();
    const draft: DeliveryReceipt = { id, deliveryNumber: `QA-${id}`, tripId: trip.id, saleId, status: 'DRAFT', receiverName: 'QA', deliveryAddressSnapshot: 'Local', createdAt: now, updatedAt: now, createdBy: 'qa', updatedBy: 'qa', lines: [{ id: randomUUID(), deliveryReceiptId: id, tripId: trip.id, tripLoadId: load.id, tripLoadLineId: loadLineId, saleId, saleItemId, productId, productSnapshot: { code: 'QA', name: 'QA', baseUnit: 'BAG', quantityScale: 1 }, loadedQuantityBaseInternal: 120, deliveredQuantityBaseInternal: 115, undeliveredQuantityBaseInternal: 5, incidentType: 'SHORTAGE', incidentNotes: 'QA', createdAt: now, updatedAt: now }] };
    const balanceKey = { pk: `BALANCE#${saleId}#${saleItemId}` };
    for (const record of [item(trip), { pk: `TRUCK#${truck.id}`, data: truck }, { ...balanceKey, soldQuantityBaseInternal: 120, allocatedQuantityBaseInternal: 120, version: 1 }, { pk: `ACTIVE_TRUCK#${truck.id}`, tripId: trip.id }, { pk: `ACTIVE_DRIVER#${trip.driverId}`, tripId: trip.id }]) await c.send(new PutCommand({ TableName: table, Item: record }));
    const repo = new DynamoDbDeliveryRepository(c, table, table, table, table);
    await repo.create(draft);
    const confirmed: DeliveryReceipt = { ...draft, status: 'CONFIRMED', outcome: 'PARTIAL', updatedAt: later };
    const finalTrip: Trip = { ...trip, status: 'DELIVERED', updatedAt: later };
    const results = await Promise.allSettled([1, 2].map(() => repo.confirm(confirmed, finalTrip, { ...truck, currentOdometerKm: 1010 }, load, now, now)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const rejected = results.find(r => r.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof DeliveryConflictError);
    const balance = (await c.send(new GetCommand({ TableName: table, Key: balanceKey, ConsistentRead: true }))).Item;
    assert.equal(balance?.['deliveredQuantityBaseInternal'], 115);
    assert.equal(balance?.['allocatedQuantityBaseInternal'], 0);
    assert.equal(120 - Number(balance?.['deliveredQuantityBaseInternal']), 5);
    assert.equal((await repo.findById(id))?.status, 'CONFIRMED');
    assert.equal((await c.send(new GetCommand({ TableName: table, Key: { pk: `TRUCK#${truck.id}` }, ConsistentRead: true }))).Item?.['data'].currentOdometerKm, 1010);
    for (const key of [`ACTIVE_TRUCK#${truck.id}`, `ACTIVE_DRIVER#${trip.driverId}`]) assert.equal((await c.send(new GetCommand({ TableName: table, Key: { pk: key }, ConsistentRead: true }))).Item, undefined);
    const listed = await new DynamoDbTripRepository(c, table, table).list({ limit: 25, dateFrom: '2026-10-04', dateTo: '2026-10-04', status: 'DELIVERED' });
    assert.equal(listed.items[0]?.id, trip.id);
    const loads = new DynamoDbTripLoadRepository(c, table, table);
    await loads.saveDraft(load); // Persist the original confirmed historical load.
    assert.deepEqual(await loads.getBalance(saleId, saleItemId), { allocated: 0, delivered: 115 });
    const makeReload = (quantity: number): TripLoad => ({ ...load, id: randomUUID(), tripId: randomUUID(), status: 'DRAFT', lines: [{ ...load.lines[0]!, quantityBaseInternal: quantity }] });
    const excessive = makeReload(6);
    await loads.saveDraft(excessive);
    await assert.rejects(loads.confirm({ ...excessive, status: 'CONFIRMED' }, new Map([[saleItemId, 120]]), now), TripLoadConflictError);
    const reloads = [makeReload(5), makeReload(5)];
    for (const reload of reloads) await loads.saveDraft(reload);
    const reloaded = await Promise.allSettled(reloads.map(reload => loads.confirm({ ...reload, status: 'CONFIRMED' }, new Map([[saleItemId, 120]]), now)));
    assert.equal(reloaded.filter(r => r.status === 'fulfilled').length, 1);
    assert.deepEqual(await loads.getBalance(saleId, saleItemId), { allocated: 5, delivered: 115 });
    assert.deepEqual(await loads.verifyBalances(), []);
    await c.send(new UpdateCommand({ TableName: table, Key: balanceKey, UpdateExpression: 'SET allocatedQuantityBaseInternal=:wrong, deliveredQuantityBaseInternal=:zero', ExpressionAttributeValues: { ':wrong': 125, ':zero': 0 } }));
    assert.equal((await loads.verifyBalances()).length, 1);
    await loads.rebuildBalances();
    assert.deepEqual(await loads.getBalance(saleId, saleItemId), { allocated: 5, delivered: 115 });
    await loads.rebuildBalances();
    assert.deepEqual(await loads.verifyBalances(), []);
    assert.equal((await repo.findById(id))?.status, 'CONFIRMED');
    let voidedDuringRebuild = false;
    c.middlewareStack.add((next, context) => async args => {
      if (context.commandName?.startsWith('TransactWrite') && !voidedDuringRebuild) {
        const tx = args.input as TransactWriteCommandInput;
        if (tx.TransactItems?.every(x => x.Put?.Item?.['entityType'] === 'DELIVERY_BALANCE')) {
          voidedDuringRebuild = true;
          await repo.void({ ...confirmed, status: 'VOIDED', updatedAt: '2026-10-04T12:00:00Z' }, later);
        }
      }
      return next(args);
    }, { step: 'initialize', name: 'qaDeliveryMaintenanceRace' });
    try { await assert.rejects(loads.rebuildBalances(), TransactionCanceledException); assert.equal(voidedDuringRebuild, true); }
    finally { c.middlewareStack.remove('qaDeliveryMaintenanceRace'); }
    assert.deepEqual(await loads.getBalance(saleId, saleItemId), { allocated: 5, delivered: 0 });
    await loads.rebuildBalances();
    assert.deepEqual(await loads.getBalance(saleId, saleItemId), { allocated: 5, delivered: 0 });
    assert.deepEqual(await loads.verifyBalances(), []);
  } finally { await client.send(new DeleteTableCommand({ TableName: table })); client.destroy(); }
});
