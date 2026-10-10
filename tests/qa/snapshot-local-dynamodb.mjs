import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient, ListTablesCommand, DescribeTableCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

// Read-only database export. Never stops, resets, restores or deletes a database.
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes', 'Explicit local QA opt-in required');
assert.equal(process.env.LCM_QA_WRITERS_PAUSED, 'yes', 'Pause all writers before exporting');
const qaPrefix = process.env.LCM_QA_BACKUP_PREFIX;
if (qaPrefix) assert.match(qaPrefix, /^lcm-qa-[0-9a-f-]{36}$/);
const healthUrl = qaPrefix ? 'http://localhost:3003/api/health' : 'http://localhost:3000/api/health';
let apiReachable = false;
try { await fetch(healthUrl, { signal: AbortSignal.timeout(3000) }); apiReachable = true; }
catch (error) { assert.equal(error.cause?.code, 'ECONNREFUSED', 'API state uncertain; do not export'); }
assert.equal(apiReachable, false, 'Stop API/web, not DynamoDB, before exporting');
const client = new DynamoDBClient({ endpoint: 'http://localhost:8000', region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
const allowed = ['users', 'categories', 'products', 'suppliers', 'customers', 'purchases', 'inventory', 'sales', 'costing', 'cash', 'trucks', 'drivers', 'trips', 'trip-loads', 'fuel', 'deliveries'].map(x => `lcm-local-${x}`);
if (qaPrefix) for (let i=0;i<allowed.length;i++) allowed[i]=`${qaPrefix}-${allowed[i].slice('lcm-local-'.length).replace('trip-loads','trip_loads')}`;
const discovered = [];
let cursor;
do { const page = await client.send(new ListTablesCommand({ ...(cursor ? { ExclusiveStartTableName: cursor } : {}) })); discovered.push(...(page.TableNames ?? [])); cursor = page.LastEvaluatedTableName; } while (cursor);
assert.ok(allowed.every(name => discovered.includes(name)), 'All sixteen operational tables must exist');
function canonical(value) {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function json(value) { return JSON.stringify(canonical(value)); }
async function scan(name) {
  const items = []; let key;
  do { const page = await client.send(new ScanCommand({ TableName: name, ConsistentRead: true, ...(key ? { ExclusiveStartKey: key } : {}) })); items.push(...(page.Items ?? [])); key = page.LastEvaluatedKey; } while (key);
  return items.sort((a, b) => json(a).localeCompare(json(b)));
}
const tables = [];
for (const name of allowed) {
  const schema = (await client.send(new DescribeTableCommand({ TableName: name }))).Table;
  const items = await scan(name);
  assert.equal(json(await scan(name)), json(items), `${name} changed during export; no backup saved`);
  tables.push({ name, schema, items });
}
// Recheck the entire set to detect writes between different table exports.
for (const table of tables) assert.equal(json(await scan(table.name)), json(table.items), `${table.name} changed; no backup saved`);
const root = fileURLToPath(new URL('../../.data/dynamodb-backups/', import.meta.url));
await mkdir(root, { recursive: true });
const filename = `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
const path = `${root}/${filename}`;
const payload = json({ format: 'lcm-local-dynamodb-attribute-values-base64-v1', capturedAt: new Date().toISOString(), endpoint: 'http://localhost:8000', tables });
await writeFile(path, payload, { flag: 'wx' });
const sha256 = createHash('sha256').update(payload).digest('hex');
assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), sha256);
await writeFile(`${path}.sha256`, `${sha256}\n`, { flag: 'wx' });
console.log(JSON.stringify({ result: 'SNAPSHOT VERIFIED', path, sha256, counts: tables.map(t => ({ table: t.name, items: t.items.length })) }));
client.destroy();
