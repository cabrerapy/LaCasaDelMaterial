import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentIamGuardrails } from '../lib/deployment-iam-guardrails.js';

test('IAM proposal requires exact LCM role and independent boundary without wildcard grants', () => {
  const policy = deploymentIamGuardrails('123456789012', 'lcm-production-runtime', 'lcm-production-runtime-boundary');
  assert.ok(!JSON.stringify(policy).includes('*'));
  const create = policy.Statement.find(s => s.Sid === 'CreateOnlyBoundedRuntime')!;
  assert.equal(create.Condition?.ArnEquals?.['iam:PermissionsBoundary'],
    'arn:aws:iam::123456789012:policy/lcm-production-runtime-boundary');
  const pass = policy.Statement.find(s => s.Sid === 'PassOnlyRuntimeToLambda')!;
  assert.equal(pass.Condition?.StringEquals?.['iam:PassedToService'], 'lambda.amazonaws.com');
  for (const s of policy.Statement.filter(s => s.Effect === 'Allow')) {
    assert.equal(s.Resource, 'arn:aws:iam::123456789012:role/lcm-production-runtime');
    assert.ok(!JSON.stringify(s.Action).includes('AttachRolePolicy'));
    assert.ok(!JSON.stringify(s.Action).includes('UpdateAssumeRolePolicy'));
  }
});
test('proposal explicitly denies changing runtime boundary or its policy versions', () => {
  const policy = deploymentIamGuardrails('123456789012', 'lcm-production-runtime', 'lcm-production-runtime-boundary');
  assert.equal(policy.Statement.find(s => s.Sid === 'NeverRemoveRuntimeBoundary')?.Effect, 'Deny');
  assert.equal(policy.Statement.find(s => s.Sid === 'NeverEditApprovedBoundary')?.Effect, 'Deny');
});
test('rejects foreign naming, wildcards and malformed account inputs', () => {
  for (const args of [['bad', 'lcm-production-runtime', 'lcm-production-boundary'],
    ['123456789012', '*', 'lcm-production-boundary'],
    ['123456789012', 'lcm-production-runtime', 'AdministratorAccess'],
    ['123456789012', 'lcm-production-runtime/other', 'lcm-production-boundary']]) {
    assert.throws(() => deploymentIamGuardrails(args[0]!, args[1]!, args[2]!));
  }
});
