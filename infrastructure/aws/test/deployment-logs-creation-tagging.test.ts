import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentLogsCreationTagging } from '../lib/deployment-logs-creation-tagging.js';
const now = Date.parse('2026-10-28T01:00:00.000Z');
test('Logs candidate permits only legacy tagging on exact group and executor within one hour', () => {
  const p = deploymentLogsCreationTagging('088668667831', 'us-east-1', '2026-10-28T01:45:00.000Z', now);
  assert.equal(p.readyToApply, false);
  const s = p.document.Statement[0]!;
  assert.deepEqual(s.Action, ['logs:TagLogGroup']);
  assert.deepEqual(s.Resource, ['arn:aws:logs:us-east-1:088668667831:log-group:/aws/lambda/lcm-production-api:*']);
  assert.equal(s.Condition.ArnEquals['aws:PrincipalArn'], 'arn:aws:iam::088668667831:role/lcm-production-cfn-executor');
  assert.equal(s.Condition.Bool['aws:SecureTransport'], 'true');
  assert.equal(s.Condition.StringEquals['aws:RequestedRegion'], 'us-east-1');
  assert.equal(s.Condition.DateGreaterThanEquals['aws:CurrentTime'], '2026-10-28T01:00:00.000Z');
});
test('Logs candidate rejects expired, overlong and foreign-region grants', () => {
  assert.throws(() => deploymentLogsCreationTagging('088668667831', 'us-east-1', '2026-10-28T01:00:00.000Z', now));
  assert.throws(() => deploymentLogsCreationTagging('088668667831', 'us-east-1', '2026-10-28T03:00:00.000Z', now));
  assert.throws(() => deploymentLogsCreationTagging('088668667831', 'us-west-2', '2026-10-28T01:45:00.000Z', now));
});
