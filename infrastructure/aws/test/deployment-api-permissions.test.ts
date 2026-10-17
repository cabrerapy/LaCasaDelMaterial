import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentApiPermissions } from '../lib/deployment-api-permissions.js';
import { runtimeResourceNames } from '../lib/runtime-resource-names.js';

const account = '123456789012', region = 'us-east-1';

test('HTTP API create is scoped to collection explicit name and request tags', () => {
  const create = deploymentApiPermissions(account, region).Statement[0]!;
  assert.deepEqual(create.Resource, [`arn:aws:apigateway:${region}::/apis`]);
  assert.deepEqual(create.Action, ['apigateway:POST']);
  assert.deepEqual(create.Condition, { StringEquals: { 'aws:PrincipalAccount': account,
    'aws:RequestedRegion': region, 'apigateway:Request/ApiName': runtimeResourceNames(account, region).apiName,
    'aws:RequestTag/Project': 'LaCasaDelMaterial', 'aws:RequestTag/Environment': 'production' } });
});

test('HTTP API configuration and children fail closed on absent project tags', () => {
  const statements = deploymentApiPermissions(account, region).Statement;
  for (const statement of statements.slice(1)) {
    assert.deepEqual(statement.Condition, { StringEquals: { 'aws:PrincipalAccount': account,
      'aws:RequestedRegion': region, 'aws:ResourceTag/Project': 'LaCasaDelMaterial',
      'aws:ResourceTag/Environment': 'production' } });
  }
  assert.deepEqual(statements[2]!.Resource, ['integrations', 'routes', 'stages']
    .map(child => `arn:aws:apigateway:${region}::/apis/*/${child}`));
});

test('API candidate grants only explicit management verbs and no unrelated collections', () => {
  const statements = deploymentApiPermissions(account, region).Statement;
  assert.deepEqual(statements[1]!.Action, ['apigateway:GET', 'apigateway:PATCH', 'apigateway:DELETE']);
  assert.ok(statements.every(s => !s.Resource.includes('*') && s.Action.every(a =>
    ['apigateway:GET', 'apigateway:POST', 'apigateway:PATCH', 'apigateway:DELETE'].includes(a))));
  for (const text of ['iam:', 'execute-api:', '/restapis', '/domainnames', '/tags', 'apigateway:PUT']) {
    assert.ok(!JSON.stringify(statements).includes(text));
  }
});

test('API candidate rejects unknown account or unreviewed region', () => {
  assert.throws(() => deploymentApiPermissions('*', region));
  assert.throws(() => deploymentApiPermissions(account, 'us-east-2'));
});
