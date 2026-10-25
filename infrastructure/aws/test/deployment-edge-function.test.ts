import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentEdgeFunction } from '../lib/deployment-edge-function.js';
const now = Date.parse('2026-10-18T12:00:00.000Z');
const make = (role = 'lcm-production-cfn-executor', expiry = '2026-10-18T12:30:00.000Z') =>
  deploymentEdgeFunction('123456789012','us-east-1',role,expiry,now);
test('initial function lifecycle uses exact named ARN, principal and expiring window', () => {
  for (const statement of make().Statement) {
    assert.deepEqual(statement.Resource, ['arn:aws:cloudfront::123456789012:function/lcm-production-spa']);
    assert.equal(statement.Condition.ArnEquals['aws:PrincipalArn'], 'arn:aws:iam::123456789012:role/lcm-production-cfn-executor');
    assert.equal(statement.Condition.DateLessThan['aws:CurrentTime'], '2026-10-18T12:30:00.000Z');
    assert.ok(!statement.Resource.some(r => r.includes('*')));
  }
});
test('function publication and creation tagging stay separate without global resource access', () => {
  const statements = make().Statement;
  const lifecycle = statements.find(s => s.Sid === 'TemporaryExactSpaFunctionLifecycle');
  const tags = statements.find(s => s.Sid === 'TemporaryExactSpaFunctionCreationTags');
  assert.ok(lifecycle && tags);
  assert.ok(lifecycle.Action.includes('cloudfront:PublishFunction'));
  assert.deepEqual(tags.Action, ['cloudfront:TagResource']);
  assert.deepEqual(tags.Condition.StringEquals, { 'aws:PrincipalAccount':'123456789012',
    'aws:RequestTag/Project':'LaCasaDelMaterial', 'aws:RequestTag/Environment':'production' });
  const actions=statements.flatMap(s => s.Action);
  for (const forbidden of ['cloudfront:CreateFunction','cloudfront:CreateDistribution','cloudfront:UntagResource','iam:PassRole']) {
    assert.ok(!actions.includes(forbidden));
  }
});
test('function lifecycle rejects expired windows, runtime and unbounded executor', () => {
  assert.throws(() => make('lcm-production-runtime'));
  assert.throws(() => make('*'));
  assert.throws(() => make('lcm-production-cfn-executor','2026-10-18T12:00:00.000Z'));
});
