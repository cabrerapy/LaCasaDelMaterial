import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// One-off, explicitly authorized recovery fixture. Never accepts an arbitrary table/user.
assert.equal(process.env.LCM_RESET_RESTORED_ADMIN, 'yes', 'Explicit restored QA reset opt-in required');
assert.notEqual(process.env.NODE_ENV, 'production');
const table = 'lcm-restore-40673426-0a5e-4507-a988-98ce8932cf86-users';
let password = process.env.LCM_RESTORED_PASSWORD;
delete process.env.LCM_RESTORED_PASSWORD;
assert.ok(password && password.length >= 10 && password.length <= 128,
  'Password must contain 10 to 128 characters; credentials omitted');
const client = new DynamoDBClient({ endpoint: 'http://127.0.0.1:8000', region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' }, maxAttempts: 1 });
try {
  const db = DynamoDBDocumentClient.from(client);
  const matches = []; let key;
  do {
    const page = await db.send(new ScanCommand({ TableName: table, ConsistentRead: true,
      FilterExpression: '#username = :username', ExpressionAttributeNames: { '#username': 'username' },
      ExpressionAttributeValues: { ':username': 'qa.admin' }, ...(key ? { ExclusiveStartKey: key } : {}) }));
    matches.push(...(page.Items ?? [])); key = page.LastEvaluatedKey;
  } while (key);
  assert.equal(matches.length, 1, 'Exactly one restored qa.admin required');
  const user = matches[0];
  assert.equal(user.role, 'ADMIN'); assert.equal(user.status, 'ACTIVE');
  assert.ok(typeof user.passwordHash === 'string' && user.passwordHash.startsWith('$argon2'));
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  assert.ok(await argon2.verify(hash, password)); password = undefined;
  await db.send(new UpdateCommand({ TableName: table, Key: { id: user.id },
    UpdateExpression: 'SET passwordHash = :hash, updatedAt = :now, updatedBy = :actor',
    ConditionExpression: '#username = :username AND #role = :role AND #status = :status AND passwordHash = :old AND updatedAt = :previous',
    ExpressionAttributeNames: { '#username': 'username', '#role': 'role', '#status': 'status' },
    ExpressionAttributeValues: { ':username': 'qa.admin', ':role': 'ADMIN', ':status': 'ACTIVE',
      ':old': user.passwordHash, ':previous': user.updatedAt, ':hash': hash,
      ':now': new Date().toISOString(), ':actor': user.id } }));
  console.log(JSON.stringify({ result: 'RESET RESTORED QA ADMIN ONLY', table, username: 'qa.admin',
    originalUnchanged: true, note: 'Does not prove original-password recovery; existing sessions not revoked' }));
} catch {
  console.error('Restored QA reset failed; credentials omitted'); process.exitCode = 1;
} finally { password = undefined; client.destroy(); }
