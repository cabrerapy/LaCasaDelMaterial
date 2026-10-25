import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentEdgeInitialLifecycle } from '../lib/deployment-edge-initial-lifecycle.js';
const now = Date.parse('2026-10-18T12:00:00.000Z');
const make = (role = 'lcm-production-cfn-executor', expiry = '2026-10-18T12:30:00.000Z') =>
  deploymentEdgeInitialLifecycle('123456789012', 'us-east-1', role, expiry, now);

test('initial lifecycle limits actions to three account-scoped resource types', () => {
  const statements = make().Statement;
  assert.deepEqual(statements.map(s => s.Resource), [
    ['arn:aws:cloudfront::123456789012:distribution/*'],
    ['arn:aws:cloudfront::123456789012:cache-policy/*'],
    ['arn:aws:cloudfront::123456789012:origin-access-control/*']
  ]);
  assert.deepEqual(statements.map(s => s.Action), [
    ['cloudfront:GetDistribution','cloudfront:GetDistributionConfig','cloudfront:UpdateDistribution',
      'cloudfront:DeleteDistribution','cloudfront:ListTagsForResource'],
    ['cloudfront:GetCachePolicy','cloudfront:GetCachePolicyConfig','cloudfront:UpdateCachePolicy','cloudfront:DeleteCachePolicy'],
    ['cloudfront:GetOriginAccessControl','cloudfront:GetOriginAccessControlConfig',
      'cloudfront:UpdateOriginAccessControl','cloudfront:DeleteOriginAccessControl']
  ]);
});
test('all initial lifecycle statements require exact executor/account and time window', () => {
  for (const statement of make().Statement) {
    assert.equal(statement.Effect, 'Allow');
    assert.deepEqual(statement.Condition.ArnEquals, {
      'aws:PrincipalArn':'arn:aws:iam::123456789012:role/lcm-production-cfn-executor' });
    assert.deepEqual(statement.Condition.StringEquals, { 'aws:PrincipalAccount':'123456789012' });
    assert.equal(statement.Condition.DateGreaterThanEquals['aws:CurrentTime'], '2026-10-18T12:00:00.000Z');
    assert.equal(statement.Condition.DateLessThan['aws:CurrentTime'], '2026-10-18T12:30:00.000Z');
  }
});
test('initial lifecycle rejects invalid targets and expired or excessive windows', () => {
  assert.throws(() => make('lcm-production-runtime'));
  assert.throws(() => make('*'));
  assert.throws(() => make('lcm-production-cfn-executor','2026-10-18T12:00:00.000Z'));
  assert.throws(() => make('lcm-production-cfn-executor','2026-10-18T13:00:00.001Z'));
});
