import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentIdentityPermissions } from '../lib/deployment-identity-permissions.js';

const account = '123456789012', region = 'us-east-1';

test('Cognito creation requires explicit project environment and region', () => {
  const create = deploymentIdentityPermissions(account, region).Statement[0]!;
  assert.deepEqual(create.Action, ['cognito-idp:CreateUserPool']);
  assert.deepEqual(create.Resource, ['*']);
  assert.deepEqual(create.Condition, { StringEquals: { 'aws:RequestedRegion': region,
    'aws:RequestTag/Project': 'LaCasaDelMaterial', 'aws:RequestTag/Environment': 'production' } });
});

test('pool configuration and tagging require existing project tags within the target account', () => {
  const statements = deploymentIdentityPermissions(account, region).Statement;
  for (const statement of statements.filter(s => !s.Resource.includes('*'))) {
    assert.deepEqual(statement.Resource, [`arn:aws:cognito-idp:${region}:${account}:userpool/${region}_*`]);
    assert.deepEqual(statement.Condition, { StringEquals: { 'aws:RequestedRegion': region,
      'aws:ResourceTag/Project': 'LaCasaDelMaterial', 'aws:ResourceTag/Environment': 'production' } });
  }
  assert.deepEqual(statements.filter(s => s.Resource.includes('*')).map(s => s.Action),
    [['cognito-idp:CreateUserPool'], ['cognito-idp:DescribeUserPoolDomain']]);
});

test('Cognito executor excludes user administration invitations authentication and pool deletion', () => {
  const actions = deploymentIdentityPermissions(account, region).Statement.flatMap(s => s.Action);
  assert.ok(actions.every(action => action.startsWith('cognito-idp:') && !action.includes('*') &&
    !action.startsWith('cognito-idp:Admin')));
  for (const action of ['ListUsers', 'InitiateAuth', 'SignUp', 'ForgotPassword',
    'DeleteUserPool', 'CreateUserPoolReplica', 'ListUserPoolClientSecrets']) {
    assert.ok(!actions.includes(`cognito-idp:${action}`));
  }
});

test('Cognito executor refuses unknown account or unreviewed region', () => {
  assert.throws(() => deploymentIdentityPermissions('*', region));
  assert.throws(() => deploymentIdentityPermissions(account, 'us-east-2'));
});
