import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { AwsBootstrapIdentity, createAwsBootstrapIdentity } from '../lib/aws-bootstrap-identity.js';
const account = '123456789012';
test('bootstrap STS adapter returns only the validated operator identity', async () => {
  const reader = new AwsBootstrapIdentity(account, { async send(command) {
    assert.ok(command instanceof GetCallerIdentityCommand);
    assert.deepEqual(command.input, {});
    return { Account: account, Arn: `arn:aws:iam::${account}:user/offline-admin`, UserId: 'not-returned', $metadata: {} };
  } });
  assert.deepEqual(await reader.read(), { account, arn: `arn:aws:iam::${account}:user/offline-admin` });
});
test('bootstrap STS adapter rejects missing fields root roles and foreign accounts', async () => {
  for (const result of [{}, { Account: account }, { Account: account, Arn: `arn:aws:iam::${account}:root` },
    { Account: account, Arn: `arn:aws:sts::${account}:assumed-role/admin/session` },
    { Account: '999999999999', Arn: 'arn:aws:iam::999999999999:user/admin' }]) {
    await assert.rejects(new AwsBootstrapIdentity(account, { async send() { return { ...result, $metadata: {} }; } }).read());
  }
  assert.throws(() => createAwsBootstrapIdentity(account, 'us-east-2'));
  assert.throws(() => createAwsBootstrapIdentity('invalid', 'us-east-1'));
});
test('bootstrap STS denial propagates without assuming account ownership', async () => {
  await assert.rejects(new AwsBootstrapIdentity(account, { async send() { throw new Error('denied'); } }).read(), /denied/);
});
