import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executorAttachmentPlan } from '../lib/executor-attachment-plan.js';
const target = {account:'123456789012',region:'us-east-1',runtimeRoleName:'lcm-production-runtime',
  boundaryName:'lcm-production-runtime-boundary',executorRoleName:'lcm-production-cfn-executor'};
const now = Date.parse('2026-10-18T12:00:00.000Z');
const plan = () => executorAttachmentPlan(target,'a'.repeat(64),'2026-10-18T12:30:00.000Z',now);
test('attachment inventory preserves sources and separates permanent and temporary policies', () => {
  const result = plan();
  assert.equal(result.readyToApply,false);
  assert.equal(result.policies.length,8);
  assert.equal(result.policies.filter(p => p.temporary).length,5);
  for (const policy of result.policies) {
    assert.ok(policy.characters <= 6144);
    for (const statement of policy.document.Statement) {
      const dated = Boolean(statement.Condition && 'DateLessThan' in statement.Condition);
      assert.equal(dated,policy.temporary);
    }
  }
});
test('inventory keeps boundary denies and excludes authority/publisher documents', () => {
  const statements: {Sid: string; Effect: string}[] = [];
  for (const policy of plan().policies) {
    for (const statement of policy.document.Statement) statements.push(statement);
  }
  assert.equal(statements.filter(s => s.Effect === 'Deny').length,2);
  assert.equal(new Set(statements.map(s => s.Sid)).size,statements.length);
  const text = JSON.stringify(plan().policies);
  assert.ok(!text.includes('TrustCloudFormationServiceOnly'));
  assert.ok(!text.includes('PublishOnlyExactLambdaZip'));
  assert.ok(!text.includes('PassOnlyLcmExecutorToCloudFormation'));
});
test('attachment plan fails closed for malformed asset or expired window', () => {
  assert.throws(() => executorAttachmentPlan(target,'bad','2026-10-18T12:30:00.000Z',now));
  assert.throws(() => executorAttachmentPlan(target,'a'.repeat(64),'2026-10-18T12:00:00.000Z',now));
});
