import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes');
const base = 'http://localhost:3001/api';
try { await fetch(`${base}/health`); throw new Error('Port 3001 already occupied; refusing to reuse'); }
catch (error) { if (error.message.includes('occupied')) throw error; }
const prefix = `lcm-qa-${randomUUID()}`;
const env = { ...process.env, NODE_ENV: 'development', API_HOST: '127.0.0.1', API_PORT: '3001',
  DYNAMODB_ENDPOINT: 'http://localhost:8000', AWS_ACCESS_KEY_ID: 'local', AWS_SECRET_ACCESS_KEY: 'local',
  AWS_REGION: 'us-east-1', INITIAL_ADMIN_PASSWORD: randomBytes(20).toString('hex'), JWT_SECRET: randomBytes(32).toString('hex'),
  LCM_QA_PASSWORD: `Qa!${randomBytes(20).toString('hex')}`, LCM_QA_BASE_URL: base };
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
  for (const module of ['inventory', 'costing', 'trip-loads']) await verify(module);
  console.log(JSON.stringify({ result: 'PASS isolated HTTP commercial and logistics flow', prefix, saleId: commercial.saleId, stock: 80, retainedTables: true, browserE2E: 'NOT RUN' }));
} finally { server.kill(); }
