import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Creates a single tagged local QA sale/trip, stopping at READY for browser testing.
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes');
assert.ok(process.env.LCM_QA_PASSWORD);
const base = 'http://localhost:3000/api';
assert.equal((await fetch(`${base}/health`).then(r => r.json())).environment, 'development');
const tokens = new Map();
async function api(role, path, method = 'GET', body, expected = 200) {
  if (!tokens.has(role)) {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `qa.${role}`, password: process.env.LCM_QA_PASSWORD }) });
    assert.equal(r.status, 200);
    tokens.set(role, (await r.json()).accessToken);
  }
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${tokens.get(role)}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await r.json();
  assert.equal(r.status, expected, `${role} ${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
const productId = process.env.LCM_QA_PRODUCT_ID;
const originalTripId = process.env.LCM_QA_TRIP_ID;
assert.ok(productId); assert.ok(originalTripId);
const product = await api('admin', `/products/${productId}`);
assert.match(product.code, /^QA-/);
const original = await api('logistics', `/trips/${originalTripId}`);
assert.equal(original.status, 'DELIVERED');
assert.match(original.destinationName, /^QA-/);
const assigned = await api('logistics', `/trips?driverId=${original.driverId}&pageSize=100`);
assert.ok(!assigned.nextToken, 'Review all driver assignments before preparing another case');
assert.ok(!assigned.items.some(t => ['READY', 'IN_TRANSIT'].includes(t.status)), 'Driver already assigned; do not create a sale');
const beforeStock = await api('warehouse', `/inventory/stock/${productId}`);
assert.ok(beforeStock.onHandInternal >= 1);
const cash = await api('cashier', '/cash/sessions/current');
assert.match(cash.openingNotes ?? '', /^QA-/);
const beforeCash = await api('cashier', `/cash/sessions/${cash.id}/summary`);
const tag = `QA-DRIVER-BROWSER-${randomUUID().slice(0, 8)}`;
const truck = await api('logistics', '/trucks', 'POST', { plate: tag, brand: 'QA', vehicleType: 'TRUCK', fuelType: 'DIESEL', maxLoadKg: 10000, maxVolumeM3: '10', currentOdometerKm: 1000 }, 201);
console.log(JSON.stringify({ step: 'truck-created', tag, truckId: truck.id }));
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
const draft = await api('cashier', '/sales', 'POST', { saleDate: day, deliveryType: 'OWN_FLEET', deliveryAddress: `${tag} Obra ficticia`, paymentMethod: 'CASH', notes: tag, items: [{ productId, presentationId: product.presentations[0].id, quantity: '1' }] }, 201);
console.log(JSON.stringify({ step: 'sale-created', tag, saleId: draft.id }));
const sale = await api('cashier', `/sales/${draft.id}/confirm`, 'POST');
assert.equal((await api('warehouse', `/inventory/stock/${productId}`)).onHandInternal, beforeStock.onHandInternal - 1);
assert.equal((await api('cashier', `/cash/sessions/${cash.id}/summary`)).expectedCashGuarani, beforeCash.expectedCashGuarani + sale.totalGuarani);
const trip = await api('logistics', '/trips', 'POST', { saleId: sale.id, truckId: truck.id, driverId: original.driverId, scheduledDate: day, destinationName: tag, destinationAddress: 'QA destino ficticio sin entrega real' }, 201);
console.log(JSON.stringify({ step: 'trip-created', tripId: trip.id }));
await api('warehouse', `/trips/${trip.id}/load`, 'POST', { lines: [{ saleItemId: sale.items[0].id, quantityBaseInternal: 1 }] }, 201);
await api('warehouse', `/trips/${trip.id}/load/confirm`, 'POST');
await api('logistics', `/trips/${trip.id}/ready`, 'POST');
console.log(JSON.stringify({ result: 'READY for driver browser', tag, saleId: sale.id, tripId: trip.id, odometer: truck.currentOdometerKm, stock: beforeStock.onHandInternal - 1, expectedCash: beforeCash.expectedCashGuarani + sale.totalGuarani }));
