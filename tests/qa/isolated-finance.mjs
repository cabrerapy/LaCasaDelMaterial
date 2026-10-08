import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createConnection } from 'node:net';

// Only new prefixed local tables. No reset, deletion or operational cash session.
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes', 'Explicit local QA opt-in required');
assert.notEqual(process.env.NODE_ENV, 'production', 'Production execution refused');
const browserMode = process.env.LCM_QA_BROWSER === 'yes';
if (browserMode) assert.ok(process.env.LCM_QA_PASSWORD, 'Browser mode requires a local QA password in LCM_QA_PASSWORD');
const base = 'http://localhost:3001/api';
// Match the exact IPv4 bind address; localhost may resolve to ::1 instead.
await new Promise((resolve, reject) => {
  const socket = createConnection({ host: '127.0.0.1', port: 3001 });
  socket.setTimeout(2000);
  socket.once('connect', () => {
    socket.destroy();
    reject(new Error('Port 127.0.0.1:3001 occupied; refusing to reuse or stop another API'));
  });
  socket.once('error', error => { socket.destroy(); if (error.code === 'ECONNREFUSED') resolve(); else reject(error); });
  socket.once('timeout', () => { socket.destroy(); reject(new Error('Port 3001 preflight timed out; refusing to create QA data')); });
});
const prefix = `lcm-qa-finance-${randomUUID()}`;
const env = {
  ...process.env, NODE_ENV: 'development', API_HOST: '127.0.0.1', API_PORT: '3001',
  DYNAMODB_ENDPOINT: 'http://localhost:8000', AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'local', AWS_SECRET_ACCESS_KEY: 'local',
  INITIAL_ADMIN_PASSWORD: `Qa!${randomBytes(20).toString('hex')}`,
  JWT_SECRET: randomBytes(32).toString('hex'),
  LCM_QA_PASSWORD: browserMode ? process.env.LCM_QA_PASSWORD : `Qa!${randomBytes(20).toString('hex')}`, LCM_QA_BASE_URL: base
};
for (const name of ['USERS', 'CATEGORIES', 'PRODUCTS', 'SUPPLIERS', 'CUSTOMERS', 'PURCHASES',
  'INVENTORY', 'SALES', 'COSTING', 'CASH', 'TRUCKS', 'DRIVERS', 'TRIPS', 'TRIP_LOADS', 'FUEL', 'DELIVERIES']) {
  env[`DYNAMODB_${name}_TABLE`] = `${prefix}-${name.toLowerCase()}`;
}
const server = spawn(process.execPath, ['apps/api/dist/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let startupError = '';
let capturingStartup = true;
function captureStartup(chunk) {
  if (capturingStartup) startupError = (startupError + chunk.toString()).slice(-64000);
}
server.stdout.on('data', captureStartup);
server.stderr.on('data', captureStartup);
function startupDiagnostic() {
  let safe = startupError;
  for (const key of ['INITIAL_ADMIN_PASSWORD', 'LCM_QA_PASSWORD', 'JWT_SECRET', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
    if (env[key]) safe = safe.replaceAll(env[key], '[REDACTED]');
  }
  safe = safe.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]');
  return safe.trim().slice(-6000) || 'No startup output captured';
}
const tokens = new Map();
async function request(role, path, method = 'GET', body, expected = 200) {
  if (!tokens.has(role)) {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `qa.${role}`, password: env.LCM_QA_PASSWORD }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(response.status, 200, `Login ${role} failed; credentials omitted`);
    tokens.set(role, (await response.json()).accessToken);
  }
  const response = await fetch(`${base}${path}`, {
    method, headers: { authorization: `Bearer ${tokens.get(role)}`,
      ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${role} ${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}
function metric(report, key) {
  const item = report.summary.find(value => value.key === key);
  assert.ok(item, `Missing report metric ${key}`);
  return item.value;
}
financeRun: try {
  console.log(JSON.stringify({ step: 'isolated-environment', prefix, retainedTables: true }));
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        assert.equal((await response.json()).environment, 'development');
        ready = true;
        break;
      }
    } catch {}
    assert.equal(server.exitCode, null, `Isolated API exited before health:\n${startupDiagnostic()}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, `Isolated API not ready; inspect local DynamoDB availability:\n${startupDiagnostic()}`);
  capturingStartup = false;
  startupError = '';
  const seed = spawn(process.execPath, ['tests/qa/seed-users.mjs'], { env, stdio: 'ignore' });
  const [seedCode] = await once(seed, 'exit');
  assert.equal(seedCode, 0, 'Isolated seed failed; credentials omitted');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date());
  const period = new URLSearchParams({ dateFrom: `${day}T00:00:00-03:00`, dateTo: `${day}T23:59:59.999-03:00` });
  const category = await request('admin', '/categories', 'POST', { name: 'QA FINANCE Materiales' }, 201);
  const product = await request('admin', '/products', 'POST', {
    code: 'QA-FINANCE', name: 'QA FINANCE producto sin stock', categoryId: category.id,
    baseUnit: 'UNIT', quantityScale: 1, minStock: 0, trackStock: false,
    presentations: [{ name: 'Unidad QA', baseQuantity: 1, salePriceGuarani: 65000, isDefault: true }]
  }, 201);
  if (browserMode) {
    console.log(JSON.stringify({ result: 'READY FOR BROWSER, NOT PASS', prefix, productId: product.id,
      base, frontend: 'http://localhost:4202', users: ['qa.admin', 'qa.cashier'],
      password: 'From LCM_QA_PASSWORD; never printed', cash: 'No cash opened; browser must perform the flow',
      retainedTables: true, stop: 'Type STOP then Enter, or Ctrl+C' }));
    const input = createInterface({ input: process.stdin });
    await new Promise(resolve => {
      const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); input.close(); resolve(); };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      input.on('line', line => { if (line.trim() === 'STOP') stop(); });
      input.once('close', stop);
    });
    break financeRun;
  }
  assert.equal(await request('cashier', '/cash/sessions/current'), null);
  const cash = await request('cashier', '/cash/sessions/open', 'POST', {
    openingCashGuarani: 100000, notes: 'QA-FINANCE isolated cash'
  }, 201);
  console.log(JSON.stringify({ step: 'fixtures', prefix, productId: product.id, cashId: cash.id }));
  const saleIds = [];
  for (const [method, quantity, reference] of [
    ['CASH', '1', undefined], ['TRANSFER', '1', 'QA cuenta A 1111'], ['TRANSFER', '2', 'QA cuenta B 2222']
  ]) {
    const draft = await request('cashier', '/sales', 'POST', {
      saleDate: day, deliveryType: 'PICKUP', paymentMethod: method,
      ...(reference ? { paymentReference: reference } : {}), notes: 'QA-FINANCE',
      items: [{ productId: product.id, presentationId: product.presentations[0].id, quantity }]
    }, 201);
    saleIds.push(draft.id);
    const sale = await request('cashier', `/sales/${draft.id}/confirm`, 'POST');
    assert.equal(sale.status, 'CONFIRMED');
    assert.equal(sale.paymentMethod, method);
    if (reference) assert.equal(sale.paymentReference, reference);
    await request('cashier', `/sales/${draft.id}/confirm`, 'POST', undefined, 409);
    assert.equal((await request('cashier', `/cash/sessions/${cash.id}/summary`)).expectedCashGuarani, 165000);
  }
  const summary = await request('cashier', `/cash/sessions/${cash.id}/summary`);
  assert.equal(summary.cashSalesGuarani, 65000);
  assert.equal(summary.transferSalesGuarani, 195000);
  assert.equal(summary.saleCount, 3);
  const movements = await request('cashier', `/cash/sessions/${cash.id}/movements`);
  assert.equal(movements.items.filter(value => value.paymentMethod === 'TRANSFER').length, 2);
  for (const value of movements.items.filter(value => value.paymentMethod === 'TRANSFER')) assert.equal(value.cashDeltaGuarani, 0);
  const dashboard = await request('cashier', `/dashboard/summary?dateFrom=${day}&dateTo=${day}`);
  assert.equal(dashboard.payments.totalGuarani, 260000);
  assert.equal(dashboard.payments.methods.find(value => value.method === 'TRANSFER').amountGuarani, 195000);
  assert.equal(dashboard.cash.expectedCashGuarani, 165000);
  assert.deepEqual(dashboard.payments.transfers.map(value => value.amountGuarani).sort((a, b) => a - b), [65000, 130000]);
  assert.equal(new Set(dashboard.payments.transfers.map(value => value.label)).size, 2);
  const payments = await request('cashier', `/reports/payments?${period}`);
  assert.equal(metric(payments, 'total'), 260000);
  assert.equal(metric(payments, 'method-TRANSFER'), 195000);
  const transfers = await request('cashier', `/reports/transfers?${period}`);
  assert.equal(metric(transfers, 'total'), 195000);
  assert.equal(transfers.items.length, 2);
  assert.deepEqual(transfers.summary.filter(value => value.key.startsWith('account-')).map(value => value.value).sort((a, b) => a - b), [65000, 130000]);
  for (const [reference, amount] of [['QA cuenta A 1111', 65000], ['QA cuenta B 2222', 130000]]) {
    const query = new URLSearchParams(period);
    query.set('transferAccountId', Buffer.from(reference.toLowerCase()).toString('base64url'));
    const filtered = await request('cashier', `/reports/transfers?${query}`);
    assert.equal(metric(filtered, 'total'), amount);
    assert.equal(filtered.items.length, 1);
  }
  await request('cashier', `/cash/sessions/${cash.id}/manual-in`, 'POST', { amountGuarani: 20000, reason: 'QA ingreso' }, 403);
  await request('admin', `/cash/sessions/${cash.id}/manual-in`, 'POST', { amountGuarani: 20000, reason: 'QA ingreso' });
  await request('admin', `/cash/sessions/${cash.id}/manual-out`, 'POST', { amountGuarani: 10000, reason: 'QA egreso' });
  const cashReport = await request('cashier', `/reports/cash?${period}`);
  assert.equal(metric(cashReport, 'income'), 85000);
  assert.equal(metric(cashReport, 'out'), 10000);
  assert.equal(metric(cashReport, 'net'), 75000);
  assert.equal(cashReport.items.length, 3, 'Transfers must not appear as physical cash');
  const closed = await request('cashier', `/cash/sessions/${cash.id}/close`, 'POST', { countedCashGuarani: 174000, notes: 'QA diferencia -1000' });
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.expectedCashGuarani, 175000);
  assert.equal(closed.countedCashGuarani, 174000);
  assert.equal(closed.differenceGuarani, -1000);
  await request('cashier', `/cash/sessions/${cash.id}/close`, 'POST', { countedCashGuarani: 175000 }, 409);
  await request('admin', `/cash/sessions/${cash.id}/manual-in`, 'POST', { amountGuarani: 1000, reason: 'QA rechazo' }, 409);
  assert.deepEqual(await request('cashier', `/cash/sessions/${cash.id}`), closed, 'Closed snapshot must remain unchanged');
  assert.equal(await request('cashier', '/cash/sessions/current'), null);
  console.log(JSON.stringify({ result: 'PASS isolated HTTP transfer and cash closing', prefix, cashId: cash.id, saleIds,
    cashSalesGuarani: 65000, transferSalesGuarani: 195000, totalCollectedGuarani: 260000,
    expectedCashGuarani: 175000, differenceGuarani: -1000, referenceGroups: 2,
    transferAccountCatalog: 'NOT IMPLEMENTED', mixedPayments: 'NOT SUPPORTED', browserE2E: 'NOT RUN', retainedTables: true }));
} finally {
  const exited = once(server, 'exit');
  if (server.exitCode === null) { server.kill(); await exited; }
}
