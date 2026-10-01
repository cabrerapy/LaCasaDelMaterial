import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { DynamoDBClient, DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ensureInventoryTable } from '../../infrastructure/dynamodb/inventory-table.js';
import { ensurePurchasesTable } from '../../infrastructure/dynamodb/purchases-table.js';
import { DynamoDbPurchaseRepository } from '../purchases/infrastructure/dynamodb-purchase.repository.js';
import { DynamoDbReceivingRepository } from '../receiving/infrastructure/dynamodb-receiving.repository.js';
import { ReceivingService } from '../receiving/application/receiving.service.js';
import { DynamoDbInventoryRepository } from './infrastructure/dynamodb-inventory.repository.js';
import { InventoryService } from './application/inventory.service.js';
import { InventoryMaintenance } from './application/inventory-maintenance.js';
import type { Purchase, PurchaseItem } from '../purchases/domain/purchase.js';

test('real DynamoDB: receipt atomicity, repeated lines, decimal, concurrency, backfill and reconciliation', { timeout: 120000 }, async () => {
  const endpoint = process.env['DYNAMODB_TEST_ENDPOINT'];
  if (endpoint !== 'http://localhost:8000') throw new Error('Set DYNAMODB_TEST_ENDPOINT=http://localhost:8000; test never targets remote tables');
  const client = new DynamoDBClient({ endpoint, region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const document = DynamoDBDocumentClient.from(client);
  const suffix = randomUUID(); const purchasesTable = `lcm-test-purchases-${suffix}`; const inventoryTable = `lcm-test-inventory-${suffix}`;
  const created: string[] = [];
  try {
    await ensurePurchasesTable(client, purchasesTable); created.push(purchasesTable);
    await ensureInventoryTable(client, inventoryTable); created.push(inventoryTable);
    const inventory = new DynamoDbInventoryRepository(document, inventoryTable);
    const purchaseRepo = new DynamoDbPurchaseRepository(document, purchasesTable);
    const receipts = new DynamoDbReceivingRepository(document, purchasesTable, inventory);
    const service = new InventoryService(inventory); const receiving = new ReceivingService(receipts, purchaseRepo, service);
    const maintenance = new InventoryMaintenance(inventory, receipts); const actor = randomUUID();
    async function purchase(productId: string, amount: number, scale = 1, lines = 1) {
      const now = new Date().toISOString(); const id = randomUUID();
      const header: Purchase = { id, purchaseNumber: `CMP-${id}`, supplierId: randomUUID(), supplierSnapshot: { businessName: 'Test' },
        purchaseDate: '2026-09-30', status: 'CONFIRMED', subtotalGuarani: amount * 52000 * lines, discountGuarani: 0,
        additionalCostsGuarani: 0, totalGuarani: amount * 52000 * lines, createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor };
      const items: PurchaseItem[] = Array.from({ length: lines }, (_, index) => ({
        id: randomUUID(), purchaseId: id, productId, presentationId: randomUUID(),
        productSnapshot: { code: scale === 1 ? 'CEM' : 'ARE', name: scale === 1 ? 'Cemento' : 'Arena', baseUnit: scale === 1 ? 'BAG' : 'M3', quantityScale: scale },
        presentationSnapshot: { name: 'Unidad', baseQuantityInternal: scale }, quantity: amount, quantityBaseInternal: amount * scale,
        orderedQuantityBaseInternal: amount * scale, receivedQuantityBaseInternal: 0, allocatedReceivedCostGuarani: 0,
        unitPurchasePriceGuarani: 52000, lineSubtotalGuarani: amount * 52000, sortOrder: index, createdAt: now, updatedAt: now
      }));
      await purchaseRepo.create(header, items); return { header, items };
    }
    async function receive(order: Awaited<ReturnType<typeof purchase>>, amount: string) {
      return receiving.create({ purchaseId: order.header.id, receiptDate: '2026-09-30',
        lines: order.items.map((item) => ({ purchaseItemId: item.id, receivedQuantity: amount })) }, actor, true);
    }
    const productId = randomUUID(); const order = await purchase(productId, 250);
    const first = await receive(order, '100'); await receiving.confirm(first.id, actor, false);
    assert.equal((await inventory.getBalance(productId))?.onHandInternal, 100);
    assert.equal((await receiving.receivingStatus(order.header.id)).status, 'PARTIALLY_RECEIVED');
    const second = await receive(order, '150'); await receiving.confirm(second.id, actor, true);
    assert.equal((await inventory.getBalance(productId))?.onHandInternal, 250);
    assert.equal((await receiving.receivingStatus(order.header.id)).status, 'RECEIVED');
    await assert.rejects(receiving.confirm(second.id, actor, true)); assert.equal((await inventory.getBalance(productId))?.onHandInternal, 250);
    const arenaId = randomUUID(); const arena = await purchase(arenaId, 10, 1000);
    const receipt = await receive(arena, '2.5'); await receiving.confirm(receipt.id, actor, false);
    assert.equal((await inventory.getBalance(arenaId))?.onHandInternal, 2500);
    // Five receipt lines of the same product must produce just one balance update within the transaction.
    const repeated = await purchase(productId, 1, 1, 5); const repeatedReceipt = await receive(repeated, '1');
    await receiving.confirm(repeatedReceipt.id, actor, true); assert.equal((await inventory.getBalance(productId))?.onHandInternal, 255);
    const concurrentId = randomUUID(); const a = await purchase(concurrentId, 100); const b = await purchase(concurrentId, 200);
    const ra = await receive(a, '100'); const rb = await receive(b, '200');
    await Promise.all([receiving.confirm(ra.id, actor, true), receiving.confirm(rb.id, actor, true)]);
    assert.equal((await inventory.getBalance(concurrentId))?.onHandInternal, 300);
    // Simulate an LCM-008 receipt through the persistence adapter with no ledger postings.
    const legacy = await purchase(randomUUID(), 10); const legacyDraft = await receive(legacy, '10');
    const legacyLines = await receipts.listReceiptLines(legacyDraft.id); const now = new Date().toISOString();
    const legacyLine = { ...legacyLines[0]!, directPurchaseCostGuarani: 520000, updatedAt: now };
    const legacyLot = { id: randomUUID(), lotNumber: `LOT-${randomUUID()}`, purchaseId: legacy.header.id,
      purchaseNumber: legacy.header.purchaseNumber, purchaseItemId: legacy.items[0]!.id, receiptId: legacyDraft.id,
      receiptNumber: legacyDraft.receiptNumber, receiptLineId: legacyLine.id, supplierId: legacy.header.supplierId,
      productId: legacyLine.productId, presentationId: legacyLine.presentationId, receivedQuantityBaseInternal: 10,
      directPurchaseCostGuarani: 520000, productSnapshot: legacyLine.productSnapshot, presentationSnapshot: legacyLine.presentationSnapshot,
      supplierSnapshot: legacy.header.supplierSnapshot, receivedAt: '2026-09-30', createdAt: now, createdBy: actor };
    const storedReceipt = (await receipts.findReceiptById(legacyDraft.id))!;
    await receipts.confirmReceipt({ ...storedReceipt, status: 'CONFIRMED', updatedAt: now }, [legacyLine], [legacyLot],
      { ...legacy.header, status: 'RECEIVED', updatedAt: now }, [{ ...legacy.items[0]!, receivedQuantityBaseInternal: 10, allocatedReceivedCostGuarani: 520000 }],
      legacy.header.updatedAt, [], storedReceipt.updatedAt);
    assert.equal((await maintenance.backfill()).created, 1); assert.equal((await maintenance.backfill()).created, 0);
    assert.deepEqual(await maintenance.verify(), []);
    await document.send(new PutCommand({ TableName: inventoryTable, Item: {
      pk: `BALANCE#${arenaId}`, entityType: 'BALANCE', productId: arenaId, onHandInternal: 999, version: 2, updatedAt: now
    } }));
    assert.match((await maintenance.verify()).join(), /balance=999/);
    assert.deepEqual((await maintenance.rebuild()).issues, []); assert.equal((await inventory.getBalance(arenaId))?.onHandInternal, 2500);
    const postings = await inventory.allMovements(); assert.equal(postings.length, 11);
    console.log(JSON.stringify({ receiptTests: 'passed', movementCount: postings.length, verification: await maintenance.verify() }));
  } finally {
    // Only the two uniquely named tables created by this test are removed.
    for (const name of created) {
      assert.ok(name === purchasesTable || name === inventoryTable);
      await client.send(new DeleteTableCommand({ TableName: name }));
    }
    client.destroy();
  }
});
