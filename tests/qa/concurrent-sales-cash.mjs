import assert from 'node:assert/strict';

// Invoked only by the isolated runner, after its report checks. No operational reuse.
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes');
assert.notEqual(process.env.NODE_ENV, 'production');
const base = process.env.LCM_QA_BASE_URL;
assert.equal(base, 'http://localhost:3003/api');
const prefix = process.env.LCM_QA_CONCURRENCY_PREFIX;
assert.match(prefix ?? '', /^lcm-qa-[0-9a-f-]{36}$/);
for (const name of ['USERS','CATEGORIES','PRODUCTS','SUPPLIERS','CUSTOMERS','PURCHASES','INVENTORY','SALES','COSTING','CASH','TRUCKS','DRIVERS','TRIPS','TRIP_LOADS','FUEL','DELIVERIES']) {
  assert.equal(process.env[`DYNAMODB_${name}_TABLE`], `${prefix}-${name.toLowerCase()}`);
}
const productId = process.env.LCM_QA_PRODUCT_ID;
assert.ok(productId);
assert.equal((await fetch(`${base}/health`).then(r => r.json())).environment, 'development');
const tokens = new Map();
for (const role of ['admin', 'cashier', 'warehouse']) {
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({ username: `qa.${role}`, password: process.env.LCM_QA_PASSWORD }), signal: AbortSignal.timeout(10000) });
  assert.equal(login.status, 200, `Login ${role}; credentials omitted`);
  tokens.set(role, (await login.json()).accessToken);
}
async function raw(role, path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, { method, headers: {authorization:`Bearer ${tokens.get(role)}`,
    ...(body === undefined ? {} : {'content-type':'application/json'})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(15000) });
  return {status:response.status, data:await response.json()};
}
async function request(role, path, method = 'GET', body, expected = 200) {
  const result = await raw(role, path, method, body);
  assert.equal(result.status, expected, `${method} ${path}`);
  return result.data;
}
const product = await request('admin', `/products/${productId}`);
const cash = await request('cashier', '/cash/sessions/current');
assert.ok(cash && cash.openingNotes?.startsWith('QA-'));
const stock = () => request('warehouse', `/inventory/stock/${productId}`);
assert.equal((await stock()).onHandInternal, 80);
const initial = await request('cashier', `/cash/sessions/${cash.id}/summary`);
const day = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Asuncion'}).format(new Date());
async function draft(quantity) {
  return request('cashier', '/sales', 'POST', {saleDate:day, deliveryType:'PICKUP', paymentMethod:'CASH',
    notes:'QA-CONCURRENCY isolated', items:[{productId,presentationId:product.presentations[0].id,quantity:String(quantity)}]}, 201);
}
const contenders = [await draft(60), await draft(60)];
const oversell = await Promise.all(contenders.map(s => raw('cashier', `/sales/${s.id}/confirm`, 'POST')));
assert.deepEqual(oversell.map(r=>r.status).sort(), [200,409], 'Only one sale may consume the available stock');
assert.equal((await stock()).onHandInternal, 20);
const duplicate = await draft(1);
const duplicateResults = await Promise.all([1,2].map(()=>raw('cashier', `/sales/${duplicate.id}/confirm`, 'POST')));
assert.deepEqual(duplicateResults.map(r=>r.status).sort(), [200,409], 'Double confirmation must post once');
assert.equal((await stock()).onHandInternal, 19);
const beforeRace = await request('cashier', `/cash/sessions/${cash.id}/summary`);
assert.equal(beforeRace.expectedCashGuarani, initial.expectedCashGuarani + 61*65000);
const racingSale = await draft(1);
const [saleResult, closeResult] = await Promise.all([
  raw('cashier', `/sales/${racingSale.id}/confirm`, 'POST'),
  raw('cashier', `/cash/sessions/${cash.id}/close`, 'POST', {countedCashGuarani:beforeRace.expectedCashGuarani,notes:'QA concurrent close'})
]);
for (const result of [saleResult,closeResult]) assert.ok([200,409].includes(result.status), 'Race must not return server errors');
assert.ok(saleResult.status===200 || closeResult.status===200, 'At least one operation must succeed');
const sold = 61 + (saleResult.status===200 ? 1 : 0);
const expectedCash = initial.expectedCashGuarani + sold*65000;
assert.equal((await stock()).onHandInternal, 80-sold);
const afterRace = await request('cashier', `/cash/sessions/${cash.id}/summary`);
assert.equal(afterRace.expectedCashGuarani, expectedCash, 'Closed/open cash snapshot must include exactly committed sales');
let session = await request('cashier', `/cash/sessions/${cash.id}`);
if (session.status==='OPEN') session = await request('cashier', `/cash/sessions/${cash.id}/close`, 'POST', {countedCashGuarani:expectedCash});
assert.equal(session.status, 'CLOSED');
assert.equal(session.expectedCashGuarani, expectedCash);
const movements = await request('cashier', `/cash/sessions/${cash.id}/movements`);
const confirmedIds = [contenders[oversell.findIndex(r=>r.status===200)].id, duplicate.id,
  ...(saleResult.status===200 ? [racingSale.id] : [])];
for (const id of confirmedIds) assert.equal(movements.items.filter(m=>m.type==='SALE_PAYMENT' && m.sourceId===id).length,1);
assert.equal(afterRace.saleCount, initial.saleCount + confirmedIds.length);
assert.equal(movements.items.reduce((sum,m)=>sum+m.cashDeltaGuarani, cash.openingCashGuarani), expectedCash);
await request('cashier', `/cash/sessions/${cash.id}/close`, 'POST', {countedCashGuarani:expectedCash},409);
const blocked = await draft(1);
await request('cashier', `/sales/${blocked.id}/confirm`, 'POST', undefined,409);
assert.deepEqual(await request('cashier', `/cash/sessions/${cash.id}`), session);
assert.deepEqual(await request('cashier', `/cash/sessions/${cash.id}/movements`), movements);
assert.equal((await stock()).onHandInternal, 80-sold);
console.log(JSON.stringify({result:'PASS isolated HTTP concurrent sales and cash', prefix, cashId:cash.id,
  oversell:oversell.map(r=>r.status), doubleConfirmation:duplicateResults.map(r=>r.status),
  saleVersusClose:[saleResult.status,closeResult.status], stock:80-sold, expectedCashGuarani:expectedCash,
  cashStatus:'CLOSED', browserDoubleClick:'NOT RUN', retainedTables:true}));
