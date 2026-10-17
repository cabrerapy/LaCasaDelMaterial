import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentDataPermissions } from '../lib/deployment-data-permissions.js';
import { runtimeResourceNames } from '../lib/runtime-resource-names.js';

test('executor data candidate scopes configuration to the sixteen exact reviewed names', () => {
  const account = '123456789012', region = 'us-east-1';
  const statement = deploymentDataPermissions(account, region).Statement[0]!;
  assert.deepEqual(statement.Resource, Object.values(runtimeResourceNames(account, region).tables)
    .map(name => `arn:aws:dynamodb:${region}:${account}:table/${name}`));
  assert.equal(new Set(statement.Resource).size, 16);
  assert.equal(statement.Condition.StringEquals['aws:RequestedRegion'], region);
  assert.ok(statement.Resource.every(resource => !resource.includes('*')));
});

test('executor data portion does not grant application data, destructive or unrelated operations', () => {
  const statement = deploymentDataPermissions('123456789012', 'us-east-1').Statement[0]!;
  for (const action of ['GetItem', 'PutItem', 'UpdateItem', 'DeleteItem', 'BatchWriteItem',
    'Query', 'Scan', 'DeleteTable', 'ImportTable', 'CreateTableReplica', 'PutResourcePolicy',
    'DeleteResourcePolicy', 'UpdateTimeToLive']) {
    assert.ok(!statement.Action.includes(`dynamodb:${action}`));
  }
  assert.ok(statement.Action.every(action => action.startsWith('dynamodb:') && !action.includes('*')));
  assert.ok(statement.Action.includes('dynamodb:UpdateContinuousBackups'));
});

test('executor data proposal rejects ambiguous account or unreviewed region', () => {
  for (const [account, region] of [['*', 'us-east-1'], ['123456789012', 'us-east-2'],
    ['123456789012', '*']]) {
    assert.throws(() => deploymentDataPermissions(account!, region!));
  }
});
