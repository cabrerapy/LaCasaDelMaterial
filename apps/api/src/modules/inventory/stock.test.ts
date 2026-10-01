import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Product } from '../products/domain/product.js';
import { InMemoryProductRepository } from '../products/infrastructure/in-memory-product.repository.js';
import { InMemoryCategoryRepository } from '../categories/infrastructure/in-memory-category.repository.js';
import { InMemoryInventoryRepository } from './infrastructure/in-memory-inventory.repository.js';
import { StockService, stockStatus } from './application/stock.service.js';
import { InventoryMaintenance } from './application/inventory-maintenance.js';
import type { InventoryMovement } from './domain/inventory.js';
import { InMemoryReceivingRepository } from '../receiving/infrastructure/in-memory-receiving.repository.js';
import { InMemoryPurchaseRepository } from '../purchases/infrastructure/in-memory-purchase.repository.js';

const actor = randomUUID(); const now = '2026-10-01T12:00:00.000Z'; const categoryId = randomUUID();
function product(overrides: Partial<Product> = {}): Product {
  const id = randomUUID(); return { id, code: `P-${id.slice(0, 5)}`, name: 'Cemento', normalizedName: 'cemento',
    categoryId, baseUnit: 'BAG', quantityScale: 1, minStockInternal: 20, trackStock: true, status: 'ACTIVE',
    createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor, ...overrides };
}
async function setup(products: readonly Product[]) {
  const catalog = new InMemoryProductRepository(); const categories = new InMemoryCategoryRepository();
  const inventory = new InMemoryInventoryRepository();
  await categories.create({ id: categoryId, name: 'Materiales', normalizedName: 'materiales', slug: 'materiales',
    status: 'ACTIVE', sortOrder: 0, createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor });
  for (const item of products) await catalog.create(item, [{ id: randomUUID(), productId: item.id, name: 'Unidad',
    sku: `SKU-${item.code}`, baseQuantityInternal: item.quantityScale, salePriceGuarani: 1000, isDefault: true,
    status: 'ACTIVE', sortOrder: 0, createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor }]);
  return { service: new StockService(catalog, categories, inventory), inventory, catalog };
}
function receipt(product: Product, amount: number): InventoryMovement {
  const id = randomUUID(); const receiptId = randomUUID();
  return { id, movementNumber: `MOV-2026-${id}`, productId: product.id,
    productSnapshot: { code: product.code, name: product.name, baseUnit: product.baseUnit, quantityScale: product.quantityScale },
    lotId: randomUUID(), lotNumber: 'LOT-TEST', purchaseId: randomUUID(), type: 'PURCHASE_RECEIPT',
    quantityDeltaInternal: amount, sourceType: 'PURCHASE_RECEIPT', sourceId: receiptId,
    sourceLineId: randomUUID(), referenceNumber: 'REC-TEST', costGuarani: 1000,
    occurredAt: now, createdAt: now, createdBy: actor };
}
test('stock status derives OK, low, out and not tracked without persistence', () => {
  const tracked = product(); assert.equal(stockStatus(tracked, 85), 'OK');
  assert.equal(stockStatus(tracked, 12), 'LOW_STOCK'); assert.equal(stockStatus(tracked, 0), 'OUT_OF_STOCK');
  assert.equal(stockStatus(tracked, -2), 'OUT_OF_STOCK'); assert.equal(stockStatus(product({ trackStock: false }), 0), 'NOT_TRACKED');
});
test('stock listing handles missing balances, shortages, filters, scaled arena and presentation search', async () => {
  const normal = product({ name: 'Normal', normalizedName: 'normal' });
  const low = product({ name: 'Bajo', normalizedName: 'bajo' });
  const arena = product({ name: 'Arena lavada', normalizedName: 'arena lavada', baseUnit: 'M3', quantityScale: 1000, minStockInternal: 5000 });
  const untracked = product({ name: 'Servicio', normalizedName: 'servicio', trackStock: false });
  const { service, inventory } = await setup([normal, low, arena, untracked]);
  await inventory.append([receipt(normal, 85)]);
  await inventory.append([receipt(low, 12)]);
  await inventory.append([receipt(arena, 7250)]);
  assert.equal((await service.list({ search: normal.code })).items[0]?.stockStatus, 'OK');
  assert.equal((await service.list({ categoryId, pageSize: 1 })).items.length, 1);
  assert.ok((await service.list({ categoryId, pageSize: 1 })).nextToken);
  const lowRow = (await service.list({ stockStatus: 'LOW_STOCK' })).items[0]!;
  assert.equal(lowRow.productId, low.id); assert.equal(lowRow.shortageInternal, 8);
  const arenaRow = (await service.detail(arena.id, true, false));
  assert.equal(arenaRow.onHandInternal, 7250); assert.equal(arenaRow.recentMovements.length, 1);
  assert.equal('costGuarani' in arenaRow.recentMovements[0]!, false);
  assert.equal((await service.list({ search: `sku-${untracked.code.toLowerCase()}` })).items[0]?.stockStatus, 'NOT_TRACKED');
});
test('missing balance is zero/out, detail and summary work, availability is reusable', async () => {
  const empty = product({ name: 'Sin balance', normalizedName: 'sin balance' });
  const untracked = product({ name: 'Servicio', normalizedName: 'servicio', trackStock: false });
  const { service } = await setup([empty, untracked]);
  const detail = await service.detail(empty.id, true, true);
  assert.equal(detail.onHandInternal, 0); assert.equal(detail.stockStatus, 'OUT_OF_STOCK');
  assert.equal(detail.shortageInternal, 20); assert.deepEqual(detail.recentMovements, []);
  assert.deepEqual(await service.summary(), { totalTrackedProducts: 1, okProducts: 0, lowStockProducts: 0, outOfStockProducts: 1, notTrackedProducts: 1 });
  assert.equal(await service.getAvailableStock(empty.id), 0); assert.equal(await service.hasSufficientStock(empty.id, 1), false);
  assert.equal(await service.getAvailableStock(untracked.id), null); assert.equal(await service.hasSufficientStock(untracked.id, 100), true);
  await assert.rejects(service.hasSufficientStock(empty.id, 0));
});
test('inventory verification reports negative and orphan balances but accepts missing balances', async () => {
  const valid = product(); const { inventory, catalog } = await setup([valid]);
  const receiving = new InMemoryReceivingRepository(new InMemoryPurchaseRepository(), inventory);
  await inventory.replaceBalance({ productId: randomUUID(), onHandInternal: -4, version: 1, updatedAt: now }, null);
  const issues = await new InventoryMaintenance(inventory, receiving, catalog).verify();
  assert.match(issues.join('\n'), /Saldo negativo/); assert.match(issues.join('\n'), /Balance huérfano/);
  assert.equal(issues.some((issue) => issue.includes(valid.id)), false);
});
