import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentEdgeDistributionTags } from '../lib/deployment-edge-distribution-tags.js';

const now = Date.parse('2026-10-18T12:00:00.000Z');
const make = (role = 'lcm-production-cfn-executor', expiry = '2026-10-18T12:30:00.000Z') =>
  deploymentEdgeDistributionTags('123456789012', 'us-east-1', role, expiry, now);

test('distribution tagging exception has only account-scoped TagResource, not lifecycle rights', () => {
  const policy = make();
  assert.equal(policy.Statement.length, 1);
  assert.deepEqual(policy.Statement[0]!.Action, ['cloudfront:TagResource']);
  assert.deepEqual(policy.Statement[0]!.Resource, ['arn:aws:cloudfront::123456789012:distribution/*']);
});

test('distribution tagging requires exact principal/account, both request tags and no extra tag keys', () => {
  const condition = make().Statement[0]!.Condition;
  assert.deepEqual(condition.ArnEquals, {
    'aws:PrincipalArn': 'arn:aws:iam::123456789012:role/lcm-production-cfn-executor'
  });
  assert.deepEqual(condition.StringEquals, { 'aws:PrincipalAccount': '123456789012',
    'aws:RequestTag/Project': 'LaCasaDelMaterial', 'aws:RequestTag/Environment': 'production' });
  assert.deepEqual(condition['ForAllValues:StringEquals'], { 'aws:TagKeys': ['Project', 'Environment'] });
  assert.equal(condition.DateLessThan['aws:CurrentTime'], '2026-10-18T12:30:00.000Z');
  assert.equal(condition.DateGreaterThanEquals['aws:CurrentTime'], '2026-10-18T12:00:00.000Z');
});

test('distribution tagging rejects expired, overlong and non-executor proposals', () => {
  assert.throws(() => make('lcm-production-runtime'));
  assert.throws(() => make('*'));
  assert.throws(() => make('lcm-production-cfn-executor', '2026-10-18T12:00:00.000Z'));
  assert.throws(() => make('lcm-production-cfn-executor', '2026-10-18T13:00:00.001Z'));
});
