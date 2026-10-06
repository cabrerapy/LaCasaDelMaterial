import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Opt-in local QA only. New tagged product isolates stock from existing fixtures.
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes');
assert.ok(process.env.LCM_QA_PASSWORD, 'QA password required');
const base = 'http://localhost:3000/api';
assert.equal((await fetch(`${base}/health`).then(r => r.json())).environment, 'development');
const tokens = new Map();
let rejected = 0;
async function api(role, path, method = 'GET', body, expected = 200) {
  if (!tokens.has(role)) {
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `qa.${role}`, password: process.env.LCM_QA_PASSWORD }) });
    assert.equal(login.status, 200, `QA login ${role}`);
    tokens.set(role, (await login.json()).accessToken);
  }
  const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${tokens.get(role)}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, `${role} ${method} ${path}: ${await response.clone().text()}`);
  if (expected >= 400) rejected++;
  return response.json();
}
const cash = await api('cashier', '/cash/sessions/current');
assert.ok(cash, 'Existing QA cash session required; no session is opened by this suite');
assert.match(cash.openingNotes ?? '', /^QA-/);
const cashBefore = await api('cashier', `/cash/sessions/${cash.id}/summary`);
const tag = `QA-GUARDS-${randomUUID().slice(0, 8)}`;
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
const category = await api('admin', '/categories', 'POST', { name: `${tag} Materiales` }, 201);
const supplier = await api('purchasing', '/suppliers', 'POST', { businessName: `${tag} Proveedor` }, 201);
const product = await api('admin', '/products', 'POST', { code: tag, name: `${tag} Cemento`, categoryId: category.id, baseUnit: 'BAG', quantityScale: 1, minStock: 1, trackStock: true, presentations: [{ name: 'Bolsa QA', sku: `${tag}-BAG`, baseQuantity: 1, salePriceGuarani: 65000, isDefault: true }] }, 201);
const presentationId = product.presentations[0].id;
const purchase = await api('purchasing', '/purchases', 'POST', { supplierId: supplier.id, purchaseDate: day, notes: tag, items: [{ productId: product.id, presentationId, quantity: 10, unitPurchasePriceGuarani: 56000 }] }, 201);
console.log(JSON.stringify({ tag, productId: product.id, purchaseId: purchase.id, step: 'fixtures' }));
const confirmed = await api('purchasing', `/purchases/${purchase.id}/confirm`, 'POST');
await api('purchasing', `/purchases/${purchase.id}`, 'PATCH', { notes: 'QA forbidden edit' }, 409);
const input = quantity => ({ purchaseId: purchase.id, receiptDate: day, notes: tag, lines: [{ purchaseItemId: confirmed.items[0].id, receivedQuantity: quantity }] });
async function stock(expected) {
  assert.equal((await api('warehouse', `/inventory/stock/${product.id}`)).onHandInternal, expected);
}
await stock(0);
await api('warehouse', '/purchase-receipts', 'POST', input('0'), 400);
await api('warehouse', '/purchase-receipts', 'POST', input('0.5'), 400);
const first = await api('warehouse', '/purchase-receipts', 'POST', input('4'), 201);
await stock(0); // Draft never enters inventory.
await api('warehouse', `/purchase-receipts/${first.id}/confirm`, 'POST');
await stock(4);
const partial = await api('admin', `/purchases/${purchase.id}`);
assert.equal(partial.status, 'PARTIALLY_RECEIVED');
assert.equal(partial.items[0].receivedQuantityBaseInternal, 4);
await api('warehouse', `/purchase-receipts/${first.id}/confirm`, 'POST', undefined, 409);
await api('warehouse', `/purchase-receipts/${first.id}`, 'PATCH', { notes: 'QA forbidden edit' }, 409);
await api('warehouse', `/purchase-receipts/${first.id}/cancel`, 'POST', undefined, 409);
await stock(4);
const excessive = await api('warehouse', '/purchase-receipts', 'POST', input('7'), 201);
await api('warehouse', `/purchase-receipts/${excessive.id}/confirm`, 'POST', undefined, 409);
assert.equal((await api('warehouse', `/purchase-receipts/${excessive.id}`)).status, 'DRAFT');
assert.equal((await api('admin', `/purchases/${purchase.id}`)).items[0].receivedQuantityBaseInternal, 4);
await stock(4);
await api('warehouse', `/purchase-receipts/${excessive.id}/cancel`, 'POST');
const last = await api('warehouse', '/purchase-receipts', 'POST', input('6'), 201);
await api('warehouse', `/purchase-receipts/${last.id}/confirm`, 'POST');
await stock(10);
const complete = await api('admin', `/purchases/${purchase.id}`);
assert.equal(complete.status, 'RECEIVED');
assert.equal(complete.items[0].receivedQuantityBaseInternal, 10);
await api('warehouse', `/purchase-receipts/${last.id}/confirm`, 'POST', undefined, 409);
await api('warehouse', '/purchase-receipts', 'POST', input('1'), 409);
const lots = await api('admin', `/lots?purchaseId=${purchase.id}`);
assert.equal(lots.items.length, 2);
assert.equal(lots.items.reduce((sum, lot) => sum + lot.receivedQuantityBaseInternal, 0), 10);
assert.equal(lots.items.reduce((sum, lot) => sum + lot.directPurchaseCostGuarani, 0), 560000);
const saleInput = { saleDate: day, deliveryType: 'PICKUP', paymentMethod: 'CASH', notes: tag, items: [{ productId: product.id, presentationId, quantity: '11' }] };
const draft = await api('cashier', '/sales', 'POST', saleInput, 201);
await api('cashier', `/sales/${draft.id}/confirm`, 'POST', undefined, 409);
assert.equal((await api('cashier', `/sales/${draft.id}`)).status, 'DRAFT');
await stock(10);
const cashAfter = await api('cashier', `/cash/sessions/${cash.id}/summary`);
assert.deepEqual(cashAfter, cashBefore, 'Rejected sale must not post any financial movement');
console.log(JSON.stringify({ result: 'PASS', tag, productId: product.id, purchaseId: purchase.id, receiptIds: [first.id, last.id], cancelledReceiptId: excessive.id, rejectedSaleId: draft.id, rejected, stock: 10, received: '4+6', lotCostGuarani: 560000, cashUnchanged: true, scope: 'HTTP partial receiving and negative business cases; not browser E2E' }));
