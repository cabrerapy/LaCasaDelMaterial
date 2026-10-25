import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentAssetRead } from '../lib/deployment-asset-read.js';

const account = '123456789012', region = 'us-east-1', role = 'lcm-production-cfn-executor';
const hash = 'a'.repeat(64);

test('asset reader grants only unversioned read of one exact bootstrap ZIP', () => {
  const policy = deploymentAssetRead(account, region, role, hash);
  assert.equal(policy.Statement.length, 1);
  const statement = policy.Statement[0];
  assert.ok(statement);
  assert.deepEqual(statement.Action, ['s3:GetObject']);
  assert.deepEqual(statement.Resource,
    [`arn:aws:s3:::cdk-hnb659fds-assets-${account}-${region}/${hash}.zip`]);
  assert.ok(!JSON.stringify(policy).includes('*'));
});

test('asset reader requires exact executor, owner, account, region and HTTPS', () => {
  const statement = deploymentAssetRead(account, region, role, hash).Statement[0];
  assert.ok(statement);
  assert.deepEqual(statement.Condition, {
    StringEquals: { 'aws:PrincipalArn': `arn:aws:iam::${account}:role/${role}`,
      'aws:PrincipalAccount': account, 's3:ResourceAccount': account, 'aws:RequestedRegion': region },
    Bool: { 'aws:SecureTransport': 'true' }
  });
});

test('asset reader rejects broad or ambiguous artifact references and runtime role', () => {
  for (const invalid of ['', '*', hash + '.zip', '../' + hash, hash.toUpperCase(), 'a'.repeat(63)]) {
    assert.throws(() => deploymentAssetRead(account, region, role, invalid));
  }
  for (const invalid of ['*', 'lcm-production-runtime', 'other-role', role + '/path']) {
    assert.throws(() => deploymentAssetRead(account, region, invalid, hash));
  }
  assert.throws(() => deploymentAssetRead('*', region, role, hash));
  assert.throws(() => deploymentAssetRead(account, 'us-east-2', role, hash));
});
