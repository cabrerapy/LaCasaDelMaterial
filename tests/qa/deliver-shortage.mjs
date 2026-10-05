import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes');
assert.ok(process.env.LCM_QA_PASSWORD);
const base = process.env.LCM_QA_BASE_URL ?? 'http://localhost:3000/api';
assert.ok(['http://localhost:3000/api', 'http://localhost:3001/api'].includes(base), 'Only fixed local QA ports allowed');
assert.equal((await fetch(`${base}/health`).then(r => r.json())).environment, 'development');
const tokens = new Map();
for (const role of ['admin', 'logistics', 'warehouse', 'driver']) {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `qa.${role}`, password: process.env.LCM_QA_PASSWORD }) });
  assert.equal(r.status, 200); tokens.set(role, (await r.json()).accessToken);
}
async function api(role, path, method = 'GET', body, expected = 200) {
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${tokens.get(role)}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await r.json(); assert.equal(r.status, expected, `${role} ${method} ${path}: ${JSON.stringify(value)}`); return value;
}
const saleId = process.env.LCM_QA_SALE_ID;
const oldTrip = process.env.LCM_QA_TRIP_ID;
assert.ok(saleId, 'Set LCM_QA_SALE_ID');
assert.ok(oldTrip, 'Set LCM_QA_TRIP_ID');
const originalTrip = await api('logistics', `/trips/${oldTrip}`);
assert.equal(originalTrip.saleId, saleId);
const balances = await api('warehouse', `/trips/${oldTrip}/load/balances`);
assert.equal(balances.length, 1); assert.equal(balances[0].remainingQuantityBaseInternal, 5, 'Requires original QA shortage; do not rerun after completion');
const sale = await api('admin', `/sales/${saleId}`); assert.match(sale.notes, /^QA-/);
const truck = await api('logistics', `/trucks/${originalTrip.truckId}`);
const trip = await api('logistics', '/trips', 'POST', { saleId, truckId: truck.id, driverId: originalTrip.driverId, scheduledDate: sale.saleDate, destinationName: `QA-SHORTAGE-${randomUUID().slice(0,8)}`, destinationAddress: 'QA Obra local' }, 201);
console.log(JSON.stringify({ step: 'created', tripId: trip.id }));
const path = `/trips/${trip.id}`;
await api('warehouse', `${path}/load`, 'POST', { lines: [{ saleItemId: balances[0].saleItemId, quantityBaseInternal: 6 }] }, 409);
await api('warehouse', `${path}/load`, 'POST', { lines: [{ saleItemId: balances[0].saleItemId, quantityBaseInternal: 5 }] }, 201);
await api('warehouse', `${path}/load/confirm`, 'POST');
await api('logistics', `${path}/ready`, 'POST');
await api('driver', `${path}/start`, 'POST', { odometerStartKm: truck.currentOdometerKm });
const draft = await api('driver', `${path}/delivery`, 'POST', { receiverName: 'QA receptor faltante' }, 201);
await api('driver', `${path}/delivery`, 'PATCH', { receiverName: 'QA receptor faltante', lines: [{ tripLoadLineId: draft.lines[0].tripLoadLineId, deliveredQuantityBaseInternal: 5, incidentType: 'NONE' }] });
const delivery = await api('driver', `${path}/delivery/confirm`, 'POST', { odometerEndKm: truck.currentOdometerKm + 1 });
assert.equal(delivery.status, 'CONFIRMED'); assert.equal(delivery.outcome, 'FULL');
await api('driver', `${path}/delivery/confirm`, 'POST', { odometerEndKm: truck.currentOdometerKm + 1 }, 409);
assert.equal((await api('warehouse', `${path}/load/balances`))[0].remainingQuantityBaseInternal, 0);
assert.equal((await api('admin', `/inventory/stock/${sale.items[0].productId}`)).onHandInternal, 80);
assert.equal((await api('driver', path)).status, 'DELIVERED');
console.log(JSON.stringify({ result: 'PASS positive role shortage flow', tripId: trip.id, deliveryId: delivery.id, delivered: 5, remaining: 0, stock: 80 }));
