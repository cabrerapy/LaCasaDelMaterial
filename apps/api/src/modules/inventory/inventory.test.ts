import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { InventoryService } from './application/inventory.service.js';
import { InventoryMaintenance } from './application/inventory-maintenance.js';
import { InMemoryInventoryRepository } from './infrastructure/in-memory-inventory.repository.js';
import { InMemoryReceivingRepository } from '../receiving/infrastructure/in-memory-receiving.repository.js';
import { InMemoryPurchaseRepository } from '../purchases/infrastructure/in-memory-purchase.repository.js';
import type { PurchaseLot, PurchaseReceipt, PurchaseReceiptLine } from '../receiving/domain/receiving.js';
import { DynamoDbInventoryRepository } from './infrastructure/dynamodb-inventory.repository.js';
import { TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Sale } from '../sales/domain/sale.js';
import type { InventoryMovement } from './domain/inventory.js';

test('maintenance validates grouped sale and void sources without requiring receipt lots', async () => {
  const lot = lotFixture(); const { repository, receiving, service } = fixture([lot]);
  await repository.append(service.prepareReceipt([lot]));
  const sale: Sale = { id: randomUUID(), saleNumber: 'VTA-QA', status: 'VOIDED', saleDate: lot.receivedAt,
    items: [20, 30].map((quantity, sortOrder) => ({ id: randomUUID(), productId: lot.productId, presentationId: lot.presentationId,
      productSnapshot: lot.productSnapshot, presentationSnapshot: lot.presentationSnapshot, quantity: String(quantity),
      quantityBaseInternal: quantity, unitPriceGuarani: 1, lineSubtotalGuarani: quantity, sortOrder, trackStock: true })),
    subtotalGuarani: 50, discountGuarani: 0, freightGuarani: 0, totalGuarani: 50, deliveryType: 'PICKUP', paymentMethod: 'CASH',
    costingStatus: 'PENDING', createdAt: lot.createdAt, updatedAt: lot.createdAt, createdBy: lot.createdBy, updatedBy: lot.createdBy };
  const posting = (type: 'SALE' | 'SALE_VOID'): InventoryMovement => ({ id: randomUUID(), movementNumber: randomUUID(),
    productId: lot.productId, productSnapshot: lot.productSnapshot, saleId: sale.id, type, sourceType: type,
    sourceId: sale.id, sourceLineId: lot.productId, referenceNumber: sale.saleNumber,
    quantityDeltaInternal: type === 'SALE' ? -50 : 50, occurredAt: lot.createdAt, createdAt: lot.createdAt, createdBy: lot.createdBy });
  const outgoing = posting('SALE'), reversal = posting('SALE_VOID');
  await repository.append([outgoing, reversal]);
  const maintenance = new InventoryMaintenance(repository, receiving, undefined, { list: async () => ({ items: [sale] }) });
  assert.deepEqual(await maintenance.verify(), []);
  assert.equal((await repository.getBalance(lot.productId))?.onHandInternal, 100);
  const original = repository.allMovements.bind(repository);
  repository.allMovements = async () => (await original()).map(item => item.id === outgoing.id ? { ...item, quantityDeltaInternal: -49 } : item);
  assert.match((await maintenance.verify()).join(), /origen de venta inconsistente/);
  repository.allMovements = async () => (await original()).filter(item => item.id !== reversal.id);
  assert.match((await maintenance.verify()).join(), /SALE_VOID movimientos=0/);
  repository.allMovements = original;
  const orphan = new InventoryMaintenance(repository, receiving, undefined, { list: async () => ({ items: [] }) });
  assert.match((await orphan.verify()).join(), /origen de venta inconsistente/);
  const draft = new InventoryMaintenance(repository, receiving, undefined, { list: async () => ({ items: [{ ...sale, status: 'DRAFT' }] }) });
  assert.match((await draft.verify()).join(), /origen de venta inconsistente/);
});

export function lotFixture(overrides: Partial<PurchaseLot> = {}): PurchaseLot {
  return { id: randomUUID(), lotNumber: `LOT-${randomUUID()}`, purchaseId: randomUUID(), purchaseNumber: 'CMP-TEST',
    purchaseItemId: randomUUID(), receiptId: randomUUID(), receiptNumber: 'REC-TEST', receiptLineId: randomUUID(),
    supplierId: randomUUID(), productId: randomUUID(), presentationId: randomUUID(), receivedQuantityBaseInternal: 100,
    directPurchaseCostGuarani: 5200000, productSnapshot: { code: 'CEM', name: 'Cemento', baseUnit: 'BAG', quantityScale: 1 },
    presentationSnapshot: { name: 'Bolsa', baseQuantityInternal: 1 }, supplierSnapshot: { businessName: 'Proveedor' },
    receivedAt: '2026-09-30', createdAt: '2026-09-30T12:00:00.000Z', createdBy: randomUUID(), ...overrides };
}
function fixture(lots: PurchaseLot[]) {
  const repository = new InMemoryInventoryRepository(); const service = new InventoryService(repository);
  const receiving = new InMemoryReceivingRepository(new InMemoryPurchaseRepository(), repository);
  const receipts: PurchaseReceipt[] = lots.map((lot) => ({
    id: lot.receiptId, receiptNumber: lot.receiptNumber, purchaseId: lot.purchaseId, purchaseNumber: lot.purchaseNumber,
    supplierId: lot.supplierId, supplierSnapshot: lot.supplierSnapshot, receiptDate: lot.receivedAt, status: 'CONFIRMED',
    createdAt: lot.createdAt, updatedAt: lot.createdAt, createdBy: lot.createdBy, updatedBy: lot.createdBy
  }));
  const lines: PurchaseReceiptLine[] = lots.map((lot) => ({
    id: lot.receiptLineId, receiptId: lot.receiptId, purchaseId: lot.purchaseId, purchaseItemId: lot.purchaseItemId,
    productId: lot.productId, presentationId: lot.presentationId, receivedQuantityBaseInternal: lot.receivedQuantityBaseInternal,
    directPurchaseCostGuarani: lot.directPurchaseCostGuarani, productSnapshot: lot.productSnapshot,
    presentationSnapshot: lot.presentationSnapshot, createdAt: lot.createdAt, updatedAt: lot.createdAt
  }));
  receiving.auditSnapshot = async () => ({ receipts, lines, lots });
  return { repository, service, receiving, maintenance: new InventoryMaintenance(repository, receiving) };
}
test('receipt postings preserve source, lot, exact money and integer quantities', async () => {
  const lot = lotFixture(); const { repository, service, maintenance } = fixture([lot]);
  const posting = service.prepareReceipt([lot])[0]!;
  assert.equal(posting.costGuarani, lot.directPurchaseCostGuarani); assert.equal(posting.lotId, lot.id);
  assert.equal(posting.sourceId, lot.receiptId); assert.equal(posting.sourceLineId, lot.receiptLineId);
  await repository.append([posting]); assert.equal((await service.getBalance(lot.productId))?.onHandInternal, 100);
  assert.deepEqual(await maintenance.verify(), []); assert.equal('costGuarani' in await service.get(posting.id, false), false);
  assert.equal((await service.get(posting.id, true)).costGuarani, lot.directPurchaseCostGuarani);
});
test('multiple and concurrent receipts accumulate without lost updates', async () => {
  const first = lotFixture(); const second = lotFixture({ productId: first.productId, receivedQuantityBaseInternal: 150 });
  const { repository, service, maintenance } = fixture([first, second]);
  await Promise.all([repository.append(service.prepareReceipt([first])), repository.append(service.prepareReceipt([second]))]);
  assert.equal((await service.getBalance(first.productId))?.onHandInternal, 250); assert.deepEqual(await maintenance.verify(), []);
});
test('duplicate source including simultaneous backfills never duplicates stock', async () => {
  const lot = lotFixture(); const { repository, service, maintenance } = fixture([lot]);
  assert.deepEqual((await Promise.all([service.backfillLot(lot), service.backfillLot(lot)])).sort(), [false, true]);
  assert.equal((await maintenance.backfill()).created, 0); assert.equal((await repository.allMovements()).length, 1);
  assert.equal((await repository.getBalance(lot.productId))?.onHandInternal, 100);
});
test('backfill twice, rebuild twice and verify preserve historical movements', async () => {
  const lot = lotFixture(); const { repository, maintenance } = fixture([lot]);
  assert.equal((await maintenance.verify()).length > 0, true);
  assert.equal((await maintenance.backfill()).created, 1); assert.equal((await maintenance.backfill()).created, 0);
  const original = await repository.allMovements(); const balance = (await repository.getBalance(lot.productId))!;
  await repository.replaceBalance({ ...balance, onHandInternal: 999, version: balance.version + 1 }, balance.version);
  assert.match((await maintenance.verify()).join(), /balance=999/);
  assert.deepEqual((await maintenance.rebuild()).issues, []); assert.deepEqual((await maintenance.rebuild()).issues, []);
  assert.deepEqual(await repository.allMovements(), original);
});
test('arena uses +2500 internal and transaction rollback leaves no ledger or balance', async () => {
  const lot = lotFixture({ receivedQuantityBaseInternal: 2500, productSnapshot: { code: 'ARE', name: 'Arena', baseUnit: 'M3', quantityScale: 1000 } });
  const { repository, service } = fixture([lot]); const movements = service.prepareReceipt([lot]);
  await assert.rejects(repository.atomic(movements, async () => { throw new Error('Receipt condition failed'); }));
  assert.equal((await repository.allMovements()).length, 0); assert.equal(await repository.getBalance(lot.productId), null);
  await repository.append(movements); assert.equal((await repository.getBalance(lot.productId))?.onHandInternal, 2500);
});
test('rebuild CAS rejects stale version and refuses negative/fractional receipt postings', async () => {
  const lot = lotFixture(); const { repository, service } = fixture([lot]);
  await repository.append(service.prepareReceipt([lot])); const old = (await repository.getBalance(lot.productId))!;
  await repository.append(service.prepareReceipt([lotFixture({ productId: lot.productId })]));
  await assert.rejects(repository.replaceBalance({ ...old, onHandInternal: 0 }, old.version));
  assert.throws(() => service.prepareReceipt([lotFixture({ receivedQuantityBaseInternal: -1 })]));
  assert.throws(() => service.prepareReceipt([lotFixture({ receivedQuantityBaseInternal: 0.5 })]));
});
test('Dynamo transaction uses source conditions and one atomic ADD per product', () => {
  const first = lotFixture(); const second = lotFixture({ productId: first.productId, receivedQuantityBaseInternal: 150 });
  const { service } = fixture([first, second]);
  const adapter = new DynamoDbInventoryRepository({} as DynamoDBDocumentClient, 'inventory-test');
  const writes = adapter.transactionItems(service.prepareReceipt([first, second]));
  const updates = writes.filter((item) => item.Update);
  assert.equal(updates.length, 1); assert.equal(updates[0]?.Update?.ExpressionAttributeValues?.[':delta'], 250);
  assert.match(updates[0]?.Update?.UpdateExpression ?? '', /ADD onHandInternal/);
  assert.equal(writes.filter((item) => item.Put?.ConditionExpression === 'attribute_not_exists(pk)').length, 6);
  assert.ok(new TransactWriteCommand({ TransactItems: writes }));
});
test('ledger filters, pagination, ordering and cost redaction apply to list', async () => {
  const first = lotFixture(); const second = lotFixture({ productId: first.productId, receivedAt: '2026-10-01' });
  const { repository, service } = fixture([first, second]); await repository.append(service.prepareReceipt([first, second]));
  const page = await service.list({ productId: first.productId, pageSize: 1 }, false);
  assert.equal(page.items[0]?.lotId, second.id); assert.equal('costGuarani' in page.items[0]!, false);
  assert.ok(page.nextToken);
  assert.equal((await service.list({ productId: first.productId, nextToken: page.nextToken, pageSize: 1 }, true)).items[0]?.lotId, first.id);
  assert.equal((await service.list({ dateTo: '2026-09-30', lotId: first.id, search: 'REC-TEST' }, true)).items.length, 1);
});
