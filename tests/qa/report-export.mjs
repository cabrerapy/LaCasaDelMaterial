import assert from 'node:assert/strict';
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes');
assert.ok(process.env.LCM_QA_PASSWORD);
const base = 'http://localhost:3000/api';
assert.equal((await fetch(`${base}/health`).then(r => r.json())).environment, 'development');
const saleId = process.env.LCM_QA_SALE_ID;
assert.ok(saleId, 'Set LCM_QA_SALE_ID');
async function login(role) {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `qa.${role}`, password: process.env.LCM_QA_PASSWORD }) });
  assert.equal(r.status, 200); return { authorization: `Bearer ${(await r.json()).accessToken}` };
}
const headers = await login('admin');
const saleResponse = await fetch(`${base}/sales/${saleId}`, { headers });
assert.equal(saleResponse.status, 200);
const sale = await saleResponse.json(); assert.match(sale.notes ?? '', /^QA-/);
// Deliberately explicit fixture range; no writes or downloads required.
const query = new URLSearchParams({ dateFrom: '2026-10-04T03:00:00.000Z', dateTo: '2026-10-05T02:59:59.999Z', saleId });
for (const type of ['payments', 'gross-margin', 'deliveries']) {
  const response = await fetch(`${base}/reports/${type}/export?${query}`, { headers });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.match(response.headers.get('content-disposition'), /attachment/);
  const csv = await response.text();
  assert.ok(csv.includes(sale.saleNumber), `${type}: missing sale`);
  if (type === 'payments') assert.ok(csv.includes('7800000'));
  if (type === 'gross-margin') { assert.ok(csv.includes('6100000')); assert.ok(csv.includes('1700000')); }
  if (type === 'deliveries') { assert.ok(csv.includes('Entrega completa')); assert.ok(csv.includes('Entrega parcial')); }
  console.log(JSON.stringify({ type, result: 'PASS', bytes: Buffer.byteLength(csv), scope: 'HTTP CSV generation; browser download not verified' }));
}
const driver = await login('driver');
const forbidden = await fetch(`${base}/reports/gross-margin/export?${query}`, { headers: driver });
assert.equal(forbidden.status, 403);
console.log(JSON.stringify({ result: 'PASS', forbiddenFinancialExport: 403, readOnly: true }));
