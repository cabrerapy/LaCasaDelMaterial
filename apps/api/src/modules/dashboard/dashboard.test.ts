import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DashboardService, inLocalPeriod } from './application/dashboard.service.js';

type Dependencies = ConstructorParameters<typeof DashboardService>;
const empty = { list: async () => ({ items: [] }), getBalances: async () => [], current: async () => null };

test('dashboard uses Asuncion day across UTC midnight and inclusive period boundaries', () => {
  assert.equal(inLocalPeriod('2026-10-05T01:02:38.757Z', '2026-10-04', '2026-10-04'), true);
  assert.equal(inLocalPeriod('2026-10-04T02:59:59.999Z', '2026-10-04', '2026-10-04'), false);
  assert.equal(inLocalPeriod('2026-10-04T03:00:00.000Z', '2026-10-04', '2026-10-04'), true);
  assert.equal(inLocalPeriod('2026-10-05T02:59:59.999Z', '2026-10-04', '2026-10-04'), true);
  assert.equal(inLocalPeriod('2026-10-05T03:00:00.000Z', '2026-10-04', '2026-10-04'), false);
});

test('dashboard paginates dated payments independently of session opening and filters local fuel/deliveries', async () => {
  let pages = 0;
  const cash = {
    ...empty,
    list: async () => { throw new Error('Must not select payments by session opening date'); },
    movements: async () => { throw new Error('Must not use capped per-session movements'); },
    listMovements: async (options: { nextToken?: string; dateTo?: string }) => {
      assert.equal(options.dateTo, '2026-10-05'); pages++;
      return { items: Array.from({ length: options.nextToken ? 1 : 100 }, () => ({
        type: 'SALE_PAYMENT', paymentMethod: 'CASH', amountGuarani: 1000,
        cashSessionId: 'old-session', occurredAt: '2026-10-05T01:00:00Z'
      })), ...(options.nextToken ? {} : { nextToken: 'page2' }) };
    },
    findSession: async () => ({ openedBy: 'cashier', openedAt: '2026-09-01T12:00:00Z' })
  };
  const fuel = { list: async () => ({ items: [
    { occurredAt: '2026-10-05T01:00:00Z', litersMilli: 10000, totalCostGuarani: 80000 },
    { occurredAt: '2026-10-05T03:00:00Z', litersMilli: 20000, totalCostGuarani: 160000 }
  ] }) };
  const deliveries = { list: async () => ({ items: [
    { createdAt: '2026-10-05T01:00:00Z', status: 'CONFIRMED', outcome: 'PARTIAL' },
    { createdAt: '2026-10-05T03:00:00Z', status: 'CONFIRMED', outcome: 'FULL' }
  ] }) };
  const service = new DashboardService(empty as unknown as Dependencies[0], empty as unknown as Dependencies[1],
    empty as unknown as Dependencies[2], empty as unknown as Dependencies[3], empty as unknown as Dependencies[4],
    deliveries as unknown as Dependencies[5], fuel as unknown as Dependencies[6], cash as unknown as Dependencies[7],
    empty as unknown as Dependencies[8]);
  const admin = await service.summary('2026-10-04', '2026-10-04', { userId: 'admin', role: 'ADMIN' });
  assert.equal(pages, 2); assert.equal(admin.payments?.totalGuarani, 101000);
  assert.equal(admin.fuel?.count, 1); assert.equal(admin.fuel?.costGuarani, 80000);
  assert.equal(admin.deliveries?.partial, 1); assert.equal(admin.deliveries?.full, 0);
  const own = await service.summary('2026-10-04', '2026-10-04', { userId: 'cashier', role: 'CASHIER' });
  assert.equal(own.payments?.totalGuarani, 101000);
  const other = await service.summary('2026-10-04', '2026-10-04', { userId: 'other', role: 'CASHIER' });
  assert.equal(other.payments?.totalGuarani, 0);
});
