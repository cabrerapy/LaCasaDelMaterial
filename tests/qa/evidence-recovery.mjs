import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { LocalDeliveryEvidenceStorage } from '../../apps/api/dist/modules/deliveries/infrastructure/local-delivery-evidence.storage.js';

// QA-only copy/recovery drill. Never writes database or overwrites source attachments.
assert.equal(process.env.LCM_RUN_LOCAL_QA, 'yes');
assert.notEqual(process.env.NODE_ENV, 'production');
const prefix = process.env.LCM_QA_EVIDENCE_PREFIX;
const id = process.env.LCM_QA_DELIVERY_ID;
assert.match(prefix ?? '', /^lcm-qa-finance-[0-9a-f-]{36}$/);
assert.match(id ?? '', /^[0-9a-f-]{36}$/);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = resolve(repoRoot, '.data/delivery-evidence');
for (const directory of [resolve(repoRoot,'.data'),sourceRoot]) {
  const info = await lstat(directory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Source directories must not be symlinks');
}
const client = new DynamoDBClient({endpoint:'http://localhost:8000',region:'us-east-1',credentials:{accessKeyId:'local',secretAccessKey:'local'}});
const db = DynamoDBDocumentClient.from(client);
const readDelivery = async () => (await db.send(new GetCommand({TableName:`${prefix}-deliveries`,Key:{pk:`DELIVERY#${id}`},ConsistentRead:true}))).Item?.data;
async function readEvidences() {
  const items = []; let key;
  do {
    const page = await db.send(new ScanCommand({TableName:`${prefix}-deliveries`,ConsistentRead:true,
      ...(key ? {ExclusiveStartKey:key} : {})}));
    items.push(...(page.Items ?? []).filter(item=>item.entityType==='EVIDENCE' && item.data?.deliveryReceiptId===id).map(item=>item.data));
    key = page.LastEvaluatedKey;
  } while (key);
  return items.sort((a,b)=>a.id.localeCompare(b.id));
}
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  const delivery = await readDelivery();
  assert.equal(delivery?.status, 'CONFIRMED', 'Only immutable confirmed QA delivery allowed');
  const evidences = await readEvidences();
  assert.ok(evidences.length > 0 && evidences.length <= 10);
  const files = [];
  for (const evidence of evidences) {
    assert.ok(evidence.storageKey.startsWith(`deliveries/${id}/`));
    assert.match(evidence.storageKey,new RegExp(`^deliveries/${id}/[0-9a-f-]{36}\\.(png|jpg|jpeg|pdf)$`));
    const path = resolve(sourceRoot, evidence.storageKey);
    assert.ok(path.startsWith(sourceRoot+sep));
    for (const directory of [resolve(sourceRoot,'deliveries'),dirname(path)]) {
      const info = await lstat(directory);
      assert.ok(info.isDirectory() && !info.isSymbolicLink());
    }
    const info = await lstat(path);
    assert.ok(info.isFile() && !info.isSymbolicLink());
    const bytes = await readFile(path);
    assert.ok(bytes.length > 0 && bytes.length <= 10*1024*1024);
    files.push({evidence,bytes,sha256:hash(bytes)});
  }
  const parent = resolve(repoRoot,'.data/evidence-recovery');
  await mkdir(parent,{recursive:true});
  const run = await mkdtemp(resolve(parent,'qa-'));
  const backupRoot = resolve(run,'backup');
  const restoredRoot = resolve(run,'restored');
  for (const file of files) {
    const target = resolve(backupRoot,file.evidence.storageKey);
    assert.ok(target.startsWith(backupRoot+sep));
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,file.bytes,{flag:'wx'});
  }
  const manifest = Buffer.from(JSON.stringify({format:'LCM-QA-EVIDENCE-1',prefix,delivery,evidences,
    files:files.map(file=>({storageKey:file.evidence.storageKey,bytes:file.bytes.length,sha256:file.sha256}))}));
  await writeFile(resolve(run,'manifest.json'),manifest,{flag:'wx'});
  await writeFile(resolve(run,'manifest.sha256'),hash(manifest),{flag:'wx'});
  assert.equal(hash(await readFile(resolve(run,'manifest.json'))),await readFile(resolve(run,'manifest.sha256'),'utf8'));
  const saved = JSON.parse(await readFile(resolve(run,'manifest.json'),'utf8'));
  const restoredStorage = new LocalDeliveryEvidenceStorage(restoredRoot);
  for (const file of saved.files) {
    const bytes = await readFile(resolve(backupRoot,file.storageKey));
    assert.equal(hash(bytes),file.sha256);
    assert.equal(bytes.length,file.bytes);
    const target = await restoredStorage.resolve(file.storageKey);
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,bytes,{flag:'wx'});
    assert.equal(hash(await readFile(await restoredStorage.resolve(file.storageKey))),file.sha256);
  }
  assert.deepEqual(await readDelivery(),delivery,'QA metadata changed during recovery drill');
  assert.deepEqual(await readEvidences(),evidences,'Evidence metadata changed during recovery drill');
  for (const file of files) assert.equal(hash(await readFile(resolve(sourceRoot,file.evidence.storageKey))),file.sha256);
  console.log(JSON.stringify({result:'PASS QA evidence file backup and independent recovery',deliveryId:id,
    files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes.length,0),artifactDirectory:run,
    sourceUnchanged:true,databaseReadOnly:true,retainedArtifacts:true,
    scope:'Local files and metadata manifest only; not combined database recovery, API download from restored storage, Docker volume or AWS recovery'}));
} finally {client.destroy();}
