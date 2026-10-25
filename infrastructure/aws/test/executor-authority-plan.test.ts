import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executorAuthorityPlan } from '../lib/executor-authority-plan.js';

test('executor trust permits only CloudFormation service, not users or account root', () => {
  const plan = executorAuthorityPlan('123456789012','us-east-1');
  assert.deepEqual(plan.trustPolicy.Statement, [{ Sid: 'TrustCloudFormationServiceOnly', Effect: 'Allow',
    Principal: { Service: 'cloudformation.amazonaws.com' }, Action: ['sts:AssumeRole'] }]);
});
test('operator can propose passing only exact executor to CloudFormation over HTTPS', () => {
  const plan = executorAuthorityPlan('123456789012','us-east-1');
  assert.deepEqual(plan.operatorPassRolePolicy.Statement, [{ Sid: 'PassOnlyLcmExecutorToCloudFormation',
    Effect: 'Allow', Action: ['iam:PassRole'], Resource: ['arn:aws:iam::123456789012:role/lcm-production-cfn-executor'],
    Condition: { ArnEquals: { 'aws:PrincipalArn':'arn:aws:iam::123456789012:user/lcm-admin' },
      StringEquals: { 'iam:PassedToService':'cloudformation.amazonaws.com','aws:PrincipalAccount':'123456789012' },
      Bool: { 'aws:SecureTransport':'true' } } }]);
  assert.ok(!JSON.stringify(plan.operatorPassRolePolicy).includes('*'));
});
test('authority plan remains incomplete, excludes stack execution and rejects unresolved scope', () => {
  const plan = executorAuthorityPlan('123456789012','us-east-1');
  assert.equal(plan.readyForDeployment, false);
  assert.equal(plan.result, 'INCOMPLETE_EXECUTOR_AUTHORITY_REVIEW_ONLY');
  assert.ok(plan.blockers.length >= 8);
  assert.ok(!Object.hasOwn(plan,'executorPolicy'));
  assert.throws(() => executorAuthorityPlan('*','us-east-1'));
  assert.throws(() => executorAuthorityPlan('123456789012','us-east-2'));
});
