import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentEdgeTaggedCreation } from '../lib/deployment-edge-tagged-creation.js';
import { deploymentEdgeCreation } from '../lib/deployment-edge-creation.js';

const account = '123456789012', region = 'us-east-1', role = 'lcm-production-cfn-executor';
const now = Date.parse('2026-10-17T12:00:00.000Z'), expiry = '2026-10-17T12:30:00.000Z';

test('tagged edge creation grants only distribution and function creation with required request tags', () => {
  const statement = deploymentEdgeTaggedCreation(account, region, role, expiry, now).Statement[0]!;
  assert.deepEqual(statement.Action, ['cloudfront:CreateDistribution', 'cloudfront:CreateFunction']);
  assert.deepEqual(statement.Resource, ['*']);
  assert.equal(statement.Condition.StringEquals['aws:RequestTag/Project'], 'LaCasaDelMaterial');
  assert.equal(statement.Condition.StringEquals['aws:RequestTag/Environment'], 'production');
  assert.ok(!JSON.stringify(statement.Action).includes('TagResource'));
});

test('tagged creation retains exact principal account and the same time boundaries', () => {
  const original = deploymentEdgeCreation(account, region, role, expiry, now).Statement[0]!.Condition;
  const condition = deploymentEdgeTaggedCreation(account, region, role, expiry, now).Statement[0]!.Condition;
  assert.deepEqual(condition.ArnEquals, original.ArnEquals);
  assert.deepEqual(condition.DateGreaterThanEquals, original.DateGreaterThanEquals);
  assert.deepEqual(condition.DateLessThan, original.DateLessThan);
  assert.equal(condition.StringEquals['aws:PrincipalAccount'], account);
});

test('tagged creation does not widen the original two untaggable exceptions', () => {
  const original = deploymentEdgeCreation(account, region, role, expiry, now);
  deploymentEdgeTaggedCreation(account, region, role, expiry, now);
  assert.deepEqual(original.Statement[0]!.Action,
    ['cloudfront:CreateCachePolicy', 'cloudfront:CreateOriginAccessControl']);
});

test('tagged creation rejects missing expired or broad executor scope through shared validation', () => {
  assert.throws(() => deploymentEdgeTaggedCreation(account, region, '*', expiry, now));
  assert.throws(() => deploymentEdgeTaggedCreation(account, region, role, '', now));
  assert.throws(() => deploymentEdgeTaggedCreation(account, region, role, expiry, now + 3600000));
  assert.throws(() => deploymentEdgeTaggedCreation(account, 'us-east-2', role, expiry, now));
});
