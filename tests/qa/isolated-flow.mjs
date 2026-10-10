import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes');
const port = process.env.LCM_QA_ISOLATED_PORT ?? '3001';
const concurrency = process.env.LCM_QA_CONCURRENCY === 'yes';
if (concurrency) assert.equal(port, '3003', 'Concurrency requires its isolated port 3003');
assert.ok(['3001', '3003'].includes(port), 'Only isolated local ports 3001/3003 allowed');
const base = `http://localhost:${port}/api`;
try { await fetch(`${base}/health`); throw new Error(`Port ${port} already occupied; refusing to reuse`); }
catch (error) { if (error.message.includes('occupied')) throw error; }
const prefix = `lcm-qa-${randomUUID()}`;
const env = { ...process.env, NODE_ENV: 'development', API_HOST: '127.0.0.1', API_PORT: port,
  DYNAMODB_ENDPOINT: 'http://localhost:8000', AWS_ACCESS_KEY_ID: 'local', AWS_SECRET_ACCESS_KEY: 'local',
  AWS_REGION: 'us-east-1', INITIAL_ADMIN_PASSWORD: randomBytes(20).toString('hex'), JWT_SECRET: randomBytes(32).toString('hex'),
  LCM_QA_PASSWORD: `Qa!${randomBytes(20).toString('hex')}`, LCM_QA_BASE_URL: base };
delete env.AWS_SESSION_TOKEN;
for (const name of ['USERS','CATEGORIES','PRODUCTS','SUPPLIERS','CUSTOMERS','PURCHASES','INVENTORY','SALES','COSTING','CASH','TRUCKS','DRIVERS','TRIPS','TRIP_LOADS','FUEL','DELIVERIES']) env[`DYNAMODB_${name}_TABLE`] = `${prefix}-${name.toLowerCase()}`;
const server = spawn(process.execPath, ['apps/api/dist/server.js'], { env, stdio: 'ignore' });
async function run(file, extra = {}) {
  const child = spawn(process.execPath, [`tests/qa/${file}`], { env: { ...env, ...extra }, stdio: ['ignore','pipe','pipe'] });
  let output = ''; child.stdout.on('data', x => { output += x; });
  let error = ''; child.stderr.on('data', x => { error += x; });
  const [code] = await once(child, 'exit'); assert.equal(code, 0, `${file}: ${error}`);
  const results = output.trim().split('\n').map(line => JSON.parse(line));
  console.log(output.trim()); return results;
}
async function verify(module) {
  const child = spawn(process.execPath, [`apps/api/dist/modules/${module}/cli.js`, 'verify'], { env, stdio: ['ignore','pipe','pipe'] });
  let output = ''; child.stdout.on('data', value => { output += value; });
  let errors = ''; child.stderr.on('data', value => { errors += value; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, `${module} verify: ${errors} ${output}`);
  console.log(JSON.stringify({ module, reconciliation: 'PASS', readOnly: true }));
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { ready = (await fetch(`${base}/health`)).ok; } catch {}
    if (ready) break;
    assert.equal(server.exitCode, null, 'Isolated API exited before health');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Isolated API not ready');
  await run('seed-users.mjs');
  const commercial = (await run('local-business-flow.mjs')).at(-1);
  const logistics = (await run('resume-logistics.mjs', { LCM_QA_SALE_ID: commercial.saleId })).at(-1);
  await run('deliver-shortage.mjs', { LCM_QA_SALE_ID: commercial.saleId, LCM_QA_TRIP_ID: logistics.tripId });
  await run('report-export.mjs', {
    LCM_QA_SALE_ID: commercial.saleId,
    LCM_QA_DATE_FROM: new Date(Date.now() - 86400000).toISOString(),
    LCM_QA_DATE_TO: new Date(Date.now() + 86400000).toISOString()
  });
  await run('role-access.mjs', { LCM_QA_SALE_ID: commercial.saleId, LCM_QA_TRIP_ID: logistics.tripId });
  if (concurrency) await run('concurrent-sales-cash.mjs', {
    LCM_QA_CONCURRENCY_PREFIX: prefix, LCM_QA_PRODUCT_ID: commercial.productId
  });
  for (const module of ['inventory', 'costing', 'trip-loads']) await verify(module);
  console.log(JSON.stringify({ result: 'PASS isolated HTTP commercial, logistics, reports and role checks', prefix, saleId: commercial.saleId, ...(concurrency ? { concurrency: 'PASS; final balances in concurrency result' } : {stock:80}), retainedTables: true, browserE2E: 'NOT RUN' }));
} finally { server.kill(); }
