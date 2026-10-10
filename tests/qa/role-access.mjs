import assert from 'node:assert/strict';
import { hasPermission } from '../../packages/contracts/dist/index.js';

assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes', 'Explicit local QA opt-in required');
assert.ok(process.env.LCM_QA_PASSWORD, 'QA password required');
const base = process.env.LCM_QA_BASE_URL ?? 'http://localhost:3000/api';
assert.ok(['http://localhost:3000/api', 'http://localhost:3001/api', 'http://localhost:3003/api'].includes(base), 'Only fixed local QA ports allowed');
const health = await fetch(`${base}/health`).then(r => r.json());
assert.equal(health.environment, 'development');
const saleId = process.env.LCM_QA_SALE_ID;
const tripId = process.env.LCM_QA_TRIP_ID;
assert.ok(saleId); assert.ok(tripId);
const expectedStock = Number(process.env.LCM_QA_EXPECTED_STOCK ?? '80');
assert.ok(Number.isSafeInteger(expectedStock) && expectedStock >= 0, 'Expected QA stock must be a non-negative integer');
const adminLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'qa.admin', password: process.env.LCM_QA_PASSWORD }) });
assert.equal(adminLogin.status, 200);
const adminHeaders = { authorization: `Bearer ${(await adminLogin.json()).accessToken}` };
async function fixture(path) {
  const r = await fetch(base + path, { headers: adminHeaders }); assert.equal(r.status, 200); return r.json();
}
const sale = await fixture(`/sales/${saleId}`); assert.match(sale.notes ?? '', /^QA-/);
const trip = await fixture(`/trips/${tripId}`); assert.equal(trip.saleId, saleId);
const fuel = await fixture(`/fuel?tripId=${tripId}`); assert.ok(fuel.items[0]);
const delivery = await fixture(`/trips/${tripId}/delivery`);
const routes = [
  ['/users', 'users.read'], ['/products', 'products.read'], ['/purchases', 'purchases.read'],
  ['/customers', 'customers.read'], ['/inventory/stock', 'inventory.read'],
  ['/trucks', 'trucks.read'], ['/drivers', 'drivers.read'], ['/trips', 'trips.read'],
  ['/fuel', 'fuel.read'], ['/dashboard/summary', 'dashboard.read'], ['/reports', 'reports.read'],
  ['/reports/gross-margin?dateFrom=2026-10-04T03:00:00Z&dateTo=2026-10-05T02:59:59.999Z', 'reports.margin.read'],
  [`/sales/${saleId}/costing`, 'sales.costs.read']
];
let checks = 0;
const tripPath = `/trips/${tripId}`;
const deniedWrites = [
  [`${tripPath}/load/confirm`, 'trip_loads.confirm', undefined],
  [`${tripPath}/start`, 'trips.start', { odometerStartKm: 1000 }],
  [`${tripPath}/delivery/confirm`, 'deliveries.confirm', { odometerEndKm: 1010 }],
  ['/fuel', 'fuel.create', { truckId: trip.truckId, liters: '1', pricePerLiterGuarani: 8000, odometerKm: 1010, occurredAt: new Date().toISOString(), notes: 'QA denied write' }],
  [`/fuel/${fuel.items[0].id}/void`, 'fuel.void', { reason: 'QA denied write' }],
  [`/deliveries/${delivery.id}/void`, 'deliveries.void', { reason: 'QA denied write' }]
];
for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'PURCHASING', 'WAREHOUSE', 'LOGISTICS', 'DRIVER']) {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `qa.${role.toLowerCase()}`, password: process.env.LCM_QA_PASSWORD }) });
  assert.equal(response.status, 200, `${role} login`);
  const session = await response.json();
  let writeChecks = 0;
  for (const [path, permission, body] of deniedWrites) {
    if (hasPermission(role, permission)) continue; // Never run authorized mutations in this negative suite.
    const r = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${session.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(r.status, 403, `${role} denied write ${path}: ${await r.text()}`);
    checks++; writeChecks++;
  }
  for (const [path, permission] of routes) {
    const r = await fetch(base + path, { headers: { authorization: `Bearer ${session.accessToken}` } });
    const body = await r.json();
    assert.equal(r.status, hasPermission(role, permission) ? 200 : 403, `${role} ${path}: ${JSON.stringify(body)}`);
    if (r.ok && path === '/dashboard/summary' && !hasPermission(role, 'sales.costs.read')) {
      assert.equal(body.sales?.fifoCostGuarani, undefined, `${role} dashboard FIFO leak`);
      assert.equal(body.sales?.grossMarginGuarani, undefined, `${role} dashboard margin leak`);
    }
    if (r.ok && path === '/purchases' && !hasPermission(role, 'purchases.costs.read')) {
      for (const purchase of body.items) assert.equal(purchase.totalGuarani, undefined, `${role} purchase cost leak`);
    }
    checks++;
  }
  if (role === 'DRIVER') {
    const headers = { authorization: `Bearer ${session.accessToken}` };
    for (const suffix of process.env.LCM_QA_UNRELATED_TRIP_ID ? ['', '/load', '/delivery'] : []) {
      const r = await fetch(`${base}/trips/${process.env.LCM_QA_UNRELATED_TRIP_ID}${suffix}`, { headers });
      assert.equal(r.status, 403, `DRIVER unrelated trip ${suffix}`);
      checks++;
    }
    const own = await fetch(`${base}${tripPath}`, { headers });
    assert.equal(own.status, 200, 'DRIVER own trip');
    checks++;
  }
  if (role === 'ADMIN') {
    const headers = { authorization: `Bearer ${session.accessToken}` };
    const stock = await fetch(`${base}/inventory/stock/${sale.items[0].productId}`, { headers }).then(r => r.json());
    assert.equal(stock.onHandInternal, expectedStock);
  }
  console.log(JSON.stringify({ role, result: 'PASS', readChecks: routes.length, deniedWriteChecks: writeChecks }));
}
console.log(JSON.stringify({ result: 'PASS', checks, unrelatedTripChecks: process.env.LCM_QA_UNRELATED_TRIP_ID ? 'executed' : 'NOT RUN: fixture required', scope: 'HTTP route permissions and selected financial field protections; not complete role E2E' }));
