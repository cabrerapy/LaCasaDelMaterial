import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ensureFuelTable } from '../../infrastructure/dynamodb/fuel-table.js';
import { ensureSalesTable } from '../../infrastructure/dynamodb/sales-table.js';
import { ensureCashTable } from '../../infrastructure/dynamodb/cash-table.js';
import { ensureTripsTable } from '../../infrastructure/dynamodb/trips-table.js';
import { DynamoDbCashRepository } from '../cash/infrastructure/dynamodb-cash.repository.js';
import type { CashMovement, CashSession } from '../cash/domain/cash.js';
import { DynamoDbFuelRepository } from '../fuel/infrastructure/dynamodb-fuel.repository.js';
import type { FuelTransaction } from '../fuel/domain/fuel.js';
import { DynamoDbInventoryRepository } from '../inventory/infrastructure/dynamodb-inventory.repository.js';
import { DynamoDbSaleRepository } from '../sales/infrastructure/dynamodb-sale.repository.js';
import type { Sale } from '../sales/domain/sale.js';
import { DynamoDbTripRepository } from '../trips/infrastructure/dynamodb-trip.repository.js';
import type { Trip } from '../trips/domain/trip.js';

test('real DynamoDB: Reports date indexes query Sales, CashMovement, Trips and Fuel', { timeout: 120_000 }, async () => {
  const endpoint = process.env['DYNAMODB_TEST_ENDPOINT'];
  if (endpoint !== 'http://localhost:8000') throw new Error('Set DYNAMODB_TEST_ENDPOINT=http://localhost:8000; test never targets remote tables');
  const client = new DynamoDBClient({ endpoint, region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const document = DynamoDBDocumentClient.from(client);
  const suffix = randomUUID(); const salesTable = `lcm-test-report-sales-${suffix}`; const fuelTable = `lcm-test-report-fuel-${suffix}`; const cashTable = `lcm-test-report-cash-${suffix}`; const tripsTable = `lcm-test-report-trips-${suffix}`;
  try {
    await ensureSalesTable(client, salesTable); await ensureFuelTable(client, fuelTable); await ensureCashTable(client, cashTable); await ensureTripsTable(client, tripsTable);
    const sales = new DynamoDbSaleRepository(document, salesTable, new DynamoDbInventoryRepository(document, `unused-${suffix}`));
    const fuel = new DynamoDbFuelRepository(document, fuelTable);
    const actor = randomUUID();
    for (const [index, saleDate] of ['2026-10-01', '2026-10-02', '2026-09-01'].entries()) await sales.create(sale(index, saleDate, actor));
    const first = await sales.list({ limit: 1, dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    assert.equal(first.items.length, 1); assert.ok(first.nextToken);
    const second = await sales.list({ limit: 1, dateFrom: '2026-10-01', dateTo: '2026-10-31', nextToken: first.nextToken });
    assert.equal(second.items.length, 1); assert.equal(new Set([...first.items, ...second.items].map((item) => item.saleDate)).size, 2);
    for (const [index, occurredAt] of ['2026-10-01T09:00:00-03:00', '2026-10-01T12:00:00-03:00', '2026-10-01T18:00:00-03:00'].entries()) await fuel.create(fuelTransaction(index, occurredAt, actor));
    const midday = await fuel.list({ limit: 100, dateFrom: '2026-10-01T10:00:00-03:00', dateTo: '2026-10-01T15:00:00-03:00' });
    assert.deepEqual(midday.items.map((item) => item.occurredAt), ['2026-10-01T12:00:00-03:00']);
    const cash = new DynamoDbCashRepository(document, cashTable); const session = cashSession(actor); await cash.open(session);
    for (const [index, occurredAt] of ['2026-10-01T09:00:00-03:00', '2026-10-01T12:00:00-03:00', '2026-10-01T18:00:00-03:00'].entries()) await cash.append(cashMovement(index, occurredAt, session.id, actor));
    assert.deepEqual((await cash.listMovements({ limit: 100, dateFrom: '2026-10-01T10:00:00-03:00', dateTo: '2026-10-01T15:00:00-03:00' })).items.map((item) => item.occurredAt), ['2026-10-01T12:00:00-03:00']);
    const trips = new DynamoDbTripRepository(document, tripsTable, `unused-trucks-${suffix}`); await trips.create(trip(0, '2026-10-01', actor)); await trips.create(trip(1, '2026-10-02', actor));
    assert.equal((await trips.list({ limit: 100, dateFrom: '2026-10-02', dateTo: '2026-10-02' })).items.length, 1);
  } finally {
    await client.send(new DeleteTableCommand({ TableName: salesTable }));
    await client.send(new DeleteTableCommand({ TableName: fuelTable }));
    await client.send(new DeleteTableCommand({ TableName: cashTable }));
    await client.send(new DeleteTableCommand({ TableName: tripsTable }));
    client.destroy();
  }
});

function sale(index: number, saleDate: string, actor: string): Sale {
  const id = randomUUID(); const now = `${saleDate}T12:00:00-03:00`;
  return { id, saleNumber: `VTA-TEST-${index}`, status: 'CONFIRMED', saleDate, items: [], subtotalGuarani: (index + 1) * 100_000, discountGuarani: 0, freightGuarani: 0, totalGuarani: (index + 1) * 100_000, deliveryType: 'PICKUP', paymentMethod: 'CASH', costingStatus: 'NOT_APPLICABLE', createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor, confirmedAt: now, confirmedBy: actor };
}

function fuelTransaction(index: number, occurredAt: string, actor: string): FuelTransaction {
  const id = randomUUID();
  return { id, fuelNumber: `COM-TEST-${index}`, truckId: randomUUID(), truckLabel: `Camión ${index}`, fuelType: 'DIESEL', litersMilli: 10_000, pricePerLiterGuarani: 8_000, totalCostGuarani: 80_000, odometerKm: 1000 + index, occurredAt, status: 'POSTED', createdAt: occurredAt, createdBy: actor };
}

function cashSession(actor: string): CashSession { const now='2026-10-01T08:00:00-03:00';return{id:randomUUID(),sessionNumber:'CAJ-TEST-1',status:'OPEN',openedBy:actor,openedAt:now,openingCashGuarani:0,expectedCashGuarani:0,createdAt:now,updatedAt:now}; }
function cashMovement(index:number,occurredAt:string,cashSessionId:string,actor:string):CashMovement{return{id:randomUUID(),movementNumber:`CAJ-MOV-${index}`,cashSessionId,type:'SALE_PAYMENT',paymentMethod:index===1?'TRANSFER':'CASH',amountGuarani:100_000,cashDeltaGuarani:index===1?0:100_000,sourceType:'SALE',sourceId:randomUUID(),referenceNumber:`VTA-${index}`,occurredAt,createdAt:occurredAt,createdBy:actor};}
function trip(index:number,scheduledDate:string,actor:string):Trip{const now=`${scheduledDate}T08:00:00-03:00`;return{id:randomUUID(),tripNumber:`VIA-TEST-${index}`,truckId:randomUUID(),truckLabel:`Camión ${index}`,driverId:randomUUID(),driverName:`Chofer ${index}`,originName:'Depósito',destinationName:'Obra',destinationAddress:'Asunción',status:'DRAFT',scheduledDate,freightChargeGuarani:0,createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor};}
