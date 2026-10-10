import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient, DescribeTableCommand, CreateTableCommand, PutItemCommand, ScanCommand, waitUntilTableExists } from '@aws-sdk/client-dynamodb';

const mode = process.argv[2] ?? 'verify';
assert.ok(['verify', 'restore'].includes(mode));
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes');
assert.equal(process.env.LCM_QA_WRITERS_PAUSED, 'yes');
if (mode === 'restore') assert.equal(process.env.LCM_RESTORE_LOCAL_QA, 'yes');
const qaPrefix = process.env.LCM_QA_BACKUP_PREFIX;
const restorePrefix = process.env.LCM_QA_RESTORE_PREFIX;
if (qaPrefix) { assert.match(qaPrefix, /^lcm-qa-[0-9a-f-]{36}$/); assert.match(restorePrefix ?? '', /^lcm-restore-[0-9a-f-]{36}$/); }
else assert.equal(restorePrefix, undefined, 'Restore mapping requires isolated QA source');
try { await fetch(qaPrefix ? 'http://localhost:3003/api/health' : 'http://localhost:3000/api/health', { signal: AbortSignal.timeout(3000) }); assert.fail('API must remain stopped'); }
catch (error) { assert.equal(error.cause?.code, 'ECONNREFUSED', 'API state uncertain or running'); }
const root = fileURLToPath(new URL('../../.data/dynamodb-backups/', import.meta.url));
assert.ok(process.env.LCM_QA_SNAPSHOT);
const path = resolve(process.env.LCM_QA_SNAPSHOT);
const within = relative(root, path);
assert.ok(within && !within.startsWith('..') && !isAbsolute(within), 'Snapshot must be inside ignored backup directory');
const payload = await readFile(path);
const sha256 = createHash('sha256').update(payload).digest('hex');
assert.equal(sha256, (await readFile(`${path}.sha256`, 'utf8')).trim(), 'Checksum mismatch');
const snapshot = JSON.parse(payload.toString('utf8'));
assert.equal(snapshot.format, 'lcm-local-dynamodb-attribute-values-base64-v1');
assert.equal(snapshot.endpoint, 'http://localhost:8000');
const allowed = ['users', 'categories', 'products', 'suppliers', 'customers', 'purchases', 'inventory', 'sales', 'costing', 'cash', 'trucks', 'drivers', 'trips', 'trip-loads', 'fuel', 'deliveries'].map(x => `lcm-local-${x}`);
if (qaPrefix) for (let i=0;i<allowed.length;i++) allowed[i]=`${qaPrefix}-${allowed[i].slice('lcm-local-'.length).replace('trip-loads','trip_loads')}`;
assert.deepEqual(snapshot.tables.map(t => t.name).sort(), allowed.sort());
if (qaPrefix) for (const table of snapshot.tables) {
  assert.equal(table.schema.TableName, table.name);
  table.name = `${restorePrefix}${table.name.slice(qaPrefix.length)}`;
  table.schema.TableName = table.name;
}
const client = new DynamoDBClient({ endpoint: 'http://localhost:8000', region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
function canonical(v) {
  if (v instanceof Uint8Array) return Buffer.from(v).toString('base64');
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
  return v;
}
const json = v => JSON.stringify(canonical(v));
function decodeAttribute(v) {
  if (v.B !== undefined) return { B: Buffer.from(v.B, 'base64') };
  if (v.BS !== undefined) return { BS: v.BS.map(x => Buffer.from(x, 'base64')) };
  if (v.M !== undefined) return { M: Object.fromEntries(Object.entries(v.M).map(([k, x]) => [k, decodeAttribute(x)])) };
  if (v.L !== undefined) return { L: v.L.map(decodeAttribute) };
  return v;
}
function definition(t) {
  return { TableName: t.TableName, AttributeDefinitions: t.AttributeDefinitions, KeySchema: t.KeySchema, BillingMode: 'PAY_PER_REQUEST',
    ...(t.GlobalSecondaryIndexes?.length ? { GlobalSecondaryIndexes: t.GlobalSecondaryIndexes.map(x => ({ IndexName: x.IndexName, KeySchema: x.KeySchema, Projection: x.Projection })) } : {}),
    ...(t.LocalSecondaryIndexes?.length ? { LocalSecondaryIndexes: t.LocalSecondaryIndexes.map(x => ({ IndexName: x.IndexName, KeySchema: x.KeySchema, Projection: x.Projection })) } : {}) };
}
async function scan(name) {
  const items = []; let key;
  do { const p = await client.send(new ScanCommand({ TableName: name, ConsistentRead: true, ...(key ? { ExclusiveStartKey: key } : {}) })); items.push(...(p.Items ?? [])); key = p.LastEvaluatedKey; } while (key);
  return items;
}
const plans = [];
// Validate every existing table before any writes; a partial restore may resume only exact matching rows.
for (const table of snapshot.tables) {
  assert.equal(table.schema.TableName, table.name);
  assert.ok(table.schema.KeySchema?.some(k => k.KeyType === 'HASH'));
  const keyOf = item => json(Object.fromEntries(table.schema.KeySchema.map(k => { assert.ok(item[k.AttributeName]); return [k.AttributeName, item[k.AttributeName]]; })));
  const expected = new Map(table.items.map(x => [keyOf(x), json(x)]));
  assert.equal(expected.size, table.items.length, 'Duplicate snapshot primary key');
  let schema;
  try { schema = (await client.send(new DescribeTableCommand({ TableName: table.name }))).Table; }
  catch (error) { if (error.name !== 'ResourceNotFoundException') throw error; }
  if (schema) assert.equal(json(definition(schema)), json(definition(table.schema)), `Schema mismatch: ${table.name}`);
  else assert.equal(mode, 'restore', `Missing table ${table.name}`);
  const actual = schema ? await scan(table.name) : [];
  for (const item of actual) assert.equal(json(item), expected.get(keyOf(item)), `Unexpected/changed existing item in ${table.name}; refusing overwrite`);
  if (mode === 'verify') assert.equal(actual.length, table.items.length, `Count mismatch ${table.name}`);
  plans.push({ table, schema, existing: new Set(actual.map(keyOf)), keyOf });
}
if (mode === 'restore') for (const plan of plans) {
  const { table } = plan;
  if (!plan.schema) { await client.send(new CreateTableCommand(definition(table.schema))); await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: table.name }); }
  for (const raw of table.items) if (!plan.existing.has(plan.keyOf(raw))) {
    const keyName = table.schema.KeySchema.find(k => k.KeyType === 'HASH').AttributeName;
    await client.send(new PutItemCommand({ TableName: table.name, Item: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, decodeAttribute(v)])), ConditionExpression: 'attribute_not_exists(#key)', ExpressionAttributeNames: { '#key': keyName } }));
  }
}
for (const { table } of plans) assert.equal(json((await scan(table.name)).map(json).sort()), json(table.items.map(json).sort()), `Final exact comparison failed: ${table.name}`);
console.log(JSON.stringify({ result: mode === 'restore' ? 'RESTORE VERIFIED' : 'LIVE SNAPSHOT MATCH VERIFIED', sha256, tables: plans.length, items: snapshot.tables.reduce((n, t) => n + t.items.length, 0) }));
client.destroy();
