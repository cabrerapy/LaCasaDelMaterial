import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publisherDelegation } from '../lib/publisher-delegation.js';
const now = Date.parse('2026-10-18T12:00:00.000Z');
const key = 'arn:aws:kms:us-east-1:123456789012:key/111fac51-e972-4c13-88f7-9f3e7a1b3ba0';
const make = (expiry = '2026-10-18T12:30:00.000Z') => publisherDelegation('123456789012','us-east-1','a'.repeat(64),key,expiry,now);
test('delegation requires independently provisioned exact boundary and stays unapplied', () => {
  const plan = make();
  assert.equal(plan.readyToApply, false);
  const create = plan.operatorPolicy.Statement.find(s => s.Sid === 'CreateOnlyBoundedPublisher');
  assert.ok(create);
  assert.ok(create.Condition && 'StringEquals' in create.Condition);
  assert.equal(create.Condition.StringEquals['iam:PermissionsBoundary'], plan.boundaryArn);
  assert.deepEqual(create.Resource, ['arn:aws:iam::123456789012:role/lcm-production-asset-publisher']);
  assert.equal(plan.boundaryDocument.Statement.length, 1);
  assert.deepEqual(plan.boundaryDocument.Statement[0]?.Action, ['s3:PutObject']);
});
test('only two scoped write grants expire and both boundary deny statements remain', () => {
  const plan = make();
  const allows = plan.operatorPolicy.Statement.filter(s => s.Effect === 'Allow');
  assert.deepEqual(allows.flatMap(s => s.Action), ['iam:CreateRole','iam:PutRolePolicy']);
  for (const s of allows) {
    assert.equal(s.Condition?.DateLessThan?.['aws:CurrentTime'], '2026-10-18T12:30:00.000Z');
    assert.equal(s.Condition?.ArnEquals?.['aws:PrincipalArn'], 'arn:aws:iam::123456789012:user/lcm-admin');
    assert.ok(s.Resource.every(r => !r.includes('*')));
  }
  assert.equal(plan.operatorPolicy.Statement.filter(s => s.Effect === 'Deny').length, 2);
});
test('delegation rejects ambiguous expired or overlong time windows', () => {
  for (const expiry of ['', '2026-10-18T12:00:00.000Z','2026-10-18T13:00:00.001Z','2026-10-18T12:30:00Z']) {
    assert.throws(() => make(expiry));
  }
});
