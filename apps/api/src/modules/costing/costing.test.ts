import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LotListOptions, ReceivingRepository } from '../receiving/domain/receiving.repository.js';
import type { PurchaseLot } from '../receiving/domain/receiving.js';
import { InMemoryInventoryRepository } from '../inventory/infrastructure/in-memory-inventory.repository.js';
import { InMemorySaleRepository } from '../sales/infrastructure/in-memory-sale.repository.js';
import type { Sale } from '../sales/domain/sale.js';
import { FifoCostingService } from './application/fifo-costing.service.js';
import { CostingMaintenance } from './application/costing-maintenance.js';
import { InMemoryCostingRepository } from './infrastructure/in-memory-costing.repository.js';
import { marginBps, proportionalCost, proportionalShares } from './domain/costing.js';

const productSnapshot = { code: 'CEM', name: 'Cemento', baseUnit: 'BAG' as const, quantityScale: 1 };
const presentationSnapshot = { name: 'Bolsa', baseQuantityInternal: 1 };
function lot(id: string, receivedAt: string, quantity: number, cost: number): PurchaseLot {
  return { id, lotNumber: id, purchaseId: 'p', purchaseNumber: 'P', purchaseItemId: 'pi', receiptId: 'r', receiptNumber: 'R', receiptLineId: id, supplierId: 's', productId: 'product', presentationId: 'presentation', receivedQuantityBaseInternal: quantity, directPurchaseCostGuarani: cost, productSnapshot, presentationSnapshot, supplierSnapshot: { businessName: 'Proveedor' }, receivedAt, createdAt: receivedAt, createdBy: 'admin' };
}
function sale(quantity: number, subtotal = 9_750_000, discount = 0): Sale {
  return { id: 'sale', saleNumber: 'VTA-1', status: 'CONFIRMED', saleDate: '2026-01-03', items: [{ id: 'item', productId: 'product', presentationId: 'presentation', productSnapshot, presentationSnapshot, quantity: String(quantity), quantityBaseInternal: quantity, unitPriceGuarani: 65_000, lineSubtotalGuarani: subtotal, sortOrder: 0, trackStock: true }], subtotalGuarani: subtotal, discountGuarani: discount, freightGuarani: 0, totalGuarani: subtotal - discount, deliveryType: 'PICKUP', paymentMethod: 'CASH', costingStatus: 'PENDING', createdAt: '2026-01-03', updatedAt: '2026-01-03', createdBy: 'cashier', updatedBy: 'cashier', confirmedAt: '2026-01-03', confirmedBy: 'cashier' };
}
function receiving(lots: readonly PurchaseLot[]): ReceivingRepository {
  return { listLots: async (options: LotListOptions) => ({ items: lots.filter((item) => !options.productId || item.productId === options.productId) }), auditSnapshot: async () => ({ receipts: [], lines: [], lots }) } as unknown as ReceivingRepository;
}

test('verify includes a new deferred lot after FIFO consumption without writing projections', async () => {
  const inventory = new InMemoryInventoryRepository();
  const sales = new InMemorySaleRepository(inventory);
  const costing = new InMemoryCostingRepository();
  const lots = [lot('A', '2026-01-01', 100, 5_000_000), lot('B', '2026-01-02', 100, 5_500_000)];
  const receipts = receiving(lots);
  const fifo = new FifoCostingService(costing, receipts, sales);
  await sales.create(sale(120, 7_800_000));
  await fifo.costSale('sale');
  lots.push(lot('C', '2026-01-04', 10, 560_000));
  await inventory.replaceBalance({ productId: 'product', onHandInternal: 90, version: 1, updatedAt: '2026-01-04' }, null);
  const before = { balances: await costing.allBalances(), allocations: await costing.allAllocations(), sale: await sales.findById('sale') };
  const maintenance = new CostingMaintenance(costing, receipts, sales, inventory, fifo);
  assert.deepEqual(await maintenance.verify(), []);
  assert.deepEqual(await maintenance.verify(), []);
  assert.deepEqual({ balances: await costing.allBalances(), allocations: await costing.allAllocations(), sale: await sales.findById('sale') }, before);
  assert.equal(await costing.getBalance('C'), null);
  await inventory.replaceBalance({ productId: 'product', onHandInternal: 89, version: 2, updatedAt: 'wrong' }, 1);
  assert.ok((await maintenance.verify()).some(error => error.includes('inventario 89 != FIFO 90')));
});

test('verify reconciles a product with no materialized FIFO balances', async () => {
  const inventory = new InMemoryInventoryRepository();
  const sales = new InMemorySaleRepository(inventory);
  const costing = new InMemoryCostingRepository();
  const receipts = receiving([lot('NEW', '2026-01-04', 10, 560_000)]);
  const maintenance = new CostingMaintenance(costing, receipts, sales, inventory, new FifoCostingService(costing, receipts, sales));
  await inventory.replaceBalance({ productId: 'product', onHandInternal: 10, version: 1, updatedAt: '2026-01-04' }, null);
  assert.deepEqual(await maintenance.verify(), []);
  assert.equal((await costing.allBalances()).length, 0);
});

test('verify still rejects missing consumed balances and corrupt historical metadata', async () => {
  const inventory = new InMemoryInventoryRepository();
  const sales = new InMemorySaleRepository(inventory);
  const costing = new InMemoryCostingRepository();
  const receipts = receiving([lot('A', '2026-01-01', 100, 5_000_000)]);
  const fifo = new FifoCostingService(costing, receipts, sales);
  await sales.create(sale(60, 3_900_000)); await fifo.costSale('sale');
  await inventory.replaceBalance({ productId: 'product', onHandInternal: 40, version: 1, updatedAt: '2026-01-03' }, null);
  const balance = await costing.getBalance('A'); assert.ok(balance);
  await costing.replaceBalance({ ...balance, totalCostGuarani: 1 });
  const maintenance = new CostingMaintenance(costing, receipts, sales, inventory, fifo);
  assert.ok((await maintenance.verify()).some(error => error.includes('saldo no coincide con lote histórico')));
  const allocations = await costing.allAllocations();
  const missing = new InMemoryCostingRepository();
  missing.allAllocations = async () => allocations;
  const broken = new CostingMaintenance(missing, receipts, sales, inventory, fifo);
  assert.ok((await broken.verify()).some(error => error.includes('saldo FIFO ausente')));
});
test('FIFO consumes oldest lots and calculates profitability', async () => {
  const sales = new InMemorySaleRepository(new InMemoryInventoryRepository()); const costing = new InMemoryCostingRepository(); await sales.create(sale(150));
  const service = new FifoCostingService(costing, receiving([lot('LOT-B', '2026-01-02', 200, 10_600_000), lot('LOT-A', '2026-01-01', 100, 5_000_000)]), sales); const result = await service.costSale('sale');
  assert.equal(result.directCogsGuarani, 7_650_000); assert.equal(result.grossProfitGuarani, 2_100_000); assert.equal(result.grossMarginBps, 2153);
  assert.deepEqual((await costing.allocationsBySale('sale')).map((item) => [item.lotNumber, item.quantityBaseInternal, item.costGuarani]), [['LOT-A', 100, 5_000_000], ['LOT-B', 50, 2_650_000]]);
  await service.costSale('sale'); assert.equal((await costing.allocationsBySale('sale')).length, 2);
});
test('integer helpers preserve guaranies and exact discount', () => {
  assert.deepEqual([proportionalCost(1000, 3, 0, 1), proportionalCost(1000, 3, 1, 1), proportionalCost(1000, 3, 2, 1)], [333, 333, 334]); assert.deepEqual(proportionalShares(10_001, [60_000, 40_000]), [6_000, 4_001]); assert.equal(marginBps(250_000, 1_000_000), 2500);
});
test('FIFO breaks same-day ties by immutable lot creation time, not random lot number', async () => {
  const sales=new InMemorySaleRepository(new InMemoryInventoryRepository());const costing=new InMemoryCostingRepository();await sales.create(sale(120,7_800_000));
  const earlier={...lot('LOT-Z','2026-10-04',100,5_000_000),createdAt:'2026-10-04T12:00:00.000Z'};
  const later={...lot('LOT-A','2026-10-04',100,5_500_000),createdAt:'2026-10-04T12:01:00.000Z'};
  const service=new FifoCostingService(costing,receiving([later,earlier]),sales);const result=await service.costSale('sale');
  assert.equal(result.directCogsGuarani,6_100_000);
  assert.deepEqual((await costing.allocationsBySale('sale')).map(a=>[a.lotNumber,a.quantityBaseInternal]),[['LOT-Z',100],['LOT-A',20]]);
  await service.costSale('sale');assert.equal((await costing.allocationsBySale('sale')).length,2);
});
test('void restores availability and keeps reversed history', async () => {
  const sales = new InMemorySaleRepository(new InMemoryInventoryRepository()); const costing = new InMemoryCostingRepository(); await sales.create(sale(60, 3_900_000)); const service = new FifoCostingService(costing, receiving([lot('LOT-A', '2026-01-01', 100, 5_000_000)]), sales); await service.costSale('sale');
  const current = await sales.findById('sale'); assert.ok(current); await sales.replace({ ...current, status: 'VOIDED', updatedAt: 'void' }, current.updatedAt); await service.reverseSaleCost('sale', 'admin', 'error');
  assert.equal((await costing.getBalance('LOT-A'))?.remainingQuantityBaseInternal, 100); assert.equal((await costing.allocationsBySale('sale'))[0]?.status, 'REVERSED'); await costing.reverseSale('sale', 'admin', 'again', new Date().toISOString()); assert.equal((await costing.getBalance('LOT-A'))?.remainingQuantityBaseInternal, 100);
});
