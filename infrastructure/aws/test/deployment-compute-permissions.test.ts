import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentComputePermissions } from '../lib/deployment-compute-permissions.js';
import { runtimeResourceNames } from '../lib/runtime-resource-names.js';

const account = '123456789012', region = 'us-east-1';

test('compute candidate scopes Lambda actions to the explicit function in the target account', () => {
  const policy = deploymentComputePermissions(account, region);
  const name = runtimeResourceNames(account, region).functionName;
  for (const statement of policy.Statement.filter(statement => statement.Action[0]!.startsWith('lambda:'))) {
    assert.deepEqual(statement.Resource, [`arn:aws:lambda:${region}:${account}:function:${name}`]);
    assert.equal(statement.Condition.StringEquals['aws:RequestedRegion'], region);
  }
  const invocation = policy.Statement.find(s => s.Action.includes('lambda:AddPermission'))!
    .Condition.StringEquals;
  assert.ok('lambda:Principal' in invocation);
  assert.equal(invocation['lambda:Principal'], 'apigateway.amazonaws.com');
  assert.ok(!policy.Statement[0]!.Action.includes('lambda:AddPermission'));
});

test('logs configuration and tagging use their respective ARN formats', () => {
  const statements = deploymentComputePermissions(account, region).Statement;
  const arn = `arn:aws:logs:${region}:${account}:log-group:/aws/lambda/lcm-production-api`;
  assert.deepEqual(statements.find(s => s.Action.includes('logs:CreateLogGroup'))!.Resource, [`${arn}:*`]);
  assert.deepEqual(statements.find(s => s.Action.includes('logs:TagResource'))!.Resource, [arn]);
  const wildcard = statements.filter(s => s.Resource.includes('*'));
  assert.equal(wildcard.length, 1);
  assert.deepEqual(wildcard[0]!.Action, ['logs:DescribeLogGroups']);
  assert.equal(wildcard[0]!.Condition.StringEquals['aws:RequestedRegion'], region);
});

test('compute proposal grants no invocation, log content reads, IAM or asset access', () => {
  const policy = deploymentComputePermissions(account, region);
  const actions = policy.Statement.flatMap(statement => statement.Action);
  for (const forbidden of ['lambda:InvokeFunction', 'lambda:CreateFunctionUrlConfig',
    'lambda:DeleteFunctionConcurrency', 'logs:DeleteLogGroup', 'logs:GetLogEvents',
    'logs:FilterLogEvents', 'logs:PutLogEvents', 'iam:PassRole', 's3:GetObject']) {
    assert.ok(!actions.includes(forbidden));
  }
  assert.ok(actions.every(action => !action.includes('*')));
});

test('compute candidate rejects unknown account and unreviewed region', () => {
  assert.throws(() => deploymentComputePermissions('*', region));
  assert.throws(() => deploymentComputePermissions(account, 'us-east-2'));
});
