import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Explicit opt-in: creates tagged QA records, never resets or deletes user data.
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes', 'Set LCM_RUN_LOCAL_QA=yes to create local QA transactions');
const base = process.env.LCM_QA_BASE_URL ?? 'http://localhost:3000/api';
assert.ok(['http://localhost:3000/api', 'http://localhost:3001/api', 'http://localhost:3003/api'].includes(base), 'Only fixed local QA ports allowed');
const health = await fetch(`${base}/health`).then(r => r.json());
assert.equal(health.environment, 'development');
const tokens = new Map();
const password = process.env.LCM_QA_PASSWORD;
assert.ok(password, 'Set LCM_QA_PASSWORD');
async function request(role, path, method = 'GET', body, expected = 200) {
  if (!tokens.has(role)) {
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `qa.${role}`, password }) });
    assert.equal(response.status, 200, `login ${role}`);
    tokens.set(role, (await response.json()).accessToken);
  }
  const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${tokens.get(role)}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  assert.equal(response.status, expected, `${role} ${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const current = await request('cashier', '/cash/sessions/current');
if (current) assert.match(current.openingNotes ?? '', /^QA-/, 'Never reuse a non-QA cash session');
const before = current ? await request('cashier', `/cash/sessions/${current.id}/summary`) : null;
const tag = `QA-${randomUUID().slice(0,8)}`;
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
const category = await request('admin', '/categories', 'POST', { name: `${tag} Materiales` }, 201);
const supplier = await request('purchasing', '/suppliers', 'POST', { businessName: `${tag} Proveedor` }, 201);
const product = await request('admin', '/products', 'POST', { code: tag, name: `${tag} Cemento`, categoryId: category.id, baseUnit: 'BAG', quantityScale: 1, minStock: 20, trackStock: true, weightPerBaseUnitGrams: 50000, volumePerBaseUnitMl: 35000, presentations: [{ name: 'Bolsa QA', sku: `${tag}-BAG`, baseQuantity: 1, salePriceGuarani: 65000, isDefault: true }] }, 201);
const presentation = product.presentations[0];
async function stock(expected) {
  const detail = await request('warehouse', `/inventory/stock/${product.id}`);
  assert.equal(detail.onHandInternal, expected, `stock ${JSON.stringify(detail)}`);
}
for (const price of [50000,55000]) {
  const purchase = await request('purchasing', '/purchases', 'POST', { supplierId: supplier.id, purchaseDate: day, items: [{ productId: product.id, presentationId: presentation.id, quantity: 100, unitPurchasePriceGuarani: price }] }, 201);
  const confirmed = await request('purchasing', `/purchases/${purchase.id}/confirm`, 'POST');
  const receipt = await request('warehouse', '/purchase-receipts', 'POST', { purchaseId: purchase.id, receiptDate: day, lines: [{ purchaseItemId: confirmed.items[0].id, receivedQuantity: '100' }] }, 201);
  await request('warehouse', `/purchase-receipts/${receipt.id}/confirm`, 'POST');
  await request('warehouse', `/purchase-receipts/${receipt.id}/confirm`, 'POST', undefined, 409);
  console.log(JSON.stringify({ step: 'purchase-receipt', price, purchaseId: purchase.id, receiptId: receipt.id }));
}
await stock(200);
const cash = current ?? await request('cashier', '/cash/sessions/open', 'POST', { openingCashGuarani: 100000, notes: tag }, 201);
const draft = await request('cashier', '/sales', 'POST', { saleDate: day, deliveryType: 'OWN_FLEET', deliveryAddress: `${tag} Obra`, paymentMethod: 'CASH', notes: tag, items: [{ productId: product.id, presentationId: presentation.id, quantity: '120' }] }, 201);
await request('cashier', `/sales/${draft.id}/confirm`, 'POST');
await request('cashier', `/sales/${draft.id}/confirm`, 'POST', undefined, 409);
await stock(80);
const sale = await request('admin', `/sales/${draft.id}`);
console.log(JSON.stringify({ step: 'fifo-evidence', tag, productId: product.id, saleId: sale.id, cashId: cash.id, actualCogs: sale.directCogsGuarani, expectedCogs: 6100000 }));
assert.equal(sale.directCogsGuarani, 6100000);
assert.equal(sale.totalGuarani, 7800000);
const summary = await request('cashier', `/cash/sessions/${cash.id}/summary`);
assert.equal(summary.expectedCashGuarani, (before?.expectedCashGuarani ?? 100000) + 7800000);
console.log(JSON.stringify({ tag, productId: product.id, saleId: sale.id, cashId: cash.id, stock: 80, fifo: sale.directCogsGuarani, expectedCash: summary.expectedCashGuarani, result: 'PASS purchase-receipt-sale-fifo-cash; logistics pending' }));
