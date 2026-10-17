import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentStoragePermissions } from '../lib/deployment-storage-permissions.js';
import { runtimeResourceNames } from '../lib/runtime-resource-names.js';

test('storage executor targets only the two exact candidate buckets', () => {
  const account = '123456789012', region = 'us-east-1';
  const names = runtimeResourceNames(account, region);
  const policy = deploymentStoragePermissions(account, region);
  for (const statement of policy.Statement) {
    assert.deepEqual(statement.Resource, [names.frontendBucket, names.evidenceBucket]
      .map(name => `arn:aws:s3:::${name}`));
    assert.ok(statement.Resource.every(resource => !resource.includes('*')));
    assert.equal(statement.Condition.StringEquals['aws:RequestedRegion'], region);
  }
});

test('storage creation is separate from owner-conditioned existing bucket configuration', () => {
  const statements = deploymentStoragePermissions('123456789012', 'us-east-1').Statement;
  const create = statements.find(statement => statement.Sid === 'ExecutorCreateExactBuckets')!;
  const configure = statements.find(statement => statement.Sid === 'ExecutorConfigureOwnedBuckets')!;
  assert.deepEqual(create.Action, ['s3:CreateBucket']);
  assert.ok(!Object.hasOwn(create.Condition.StringEquals, 's3:ResourceAccount'));
  assert.equal(configure.Condition.StringEquals['s3:ResourceAccount'], '123456789012');
  assert.ok(!configure.Action.includes('s3:CreateBucket'));
});

test('storage portion grants no object operations, deletion, ACL writes or bootstrap access', () => {
  const policy = deploymentStoragePermissions('123456789012', 'us-east-1');
  const actions = policy.Statement.flatMap(statement => statement.Action);
  for (const forbidden of ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket',
    's3:DeleteBucket', 's3:DeleteBucketPolicy', 's3:PutBucketAcl', 's3:PutObjectAcl',
    's3:PutBucketWebsite', 's3:PutReplicationConfiguration', 's3:ListAllMyBuckets']) {
    assert.ok(!actions.includes(forbidden));
  }
  assert.ok(actions.every(action => action.startsWith('s3:') && !action.includes('*')));
  assert.ok(!JSON.stringify(policy).includes('cdk-hnb659fds'));
});

test('storage proposal rejects unresolved account and unreviewed region', () => {
  assert.throws(() => deploymentStoragePermissions('*', 'us-east-1'));
  assert.throws(() => deploymentStoragePermissions('123456789012', 'us-east-2'));
});
