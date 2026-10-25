import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { executionReviewPackage } from '../lib/execution-review-package.js';
const account = '123456789012';
const stack = '8fa7e2a0-d00e-11f1-ba85-0affdd34c96b';
const now = Date.parse('2026-10-24T12:00:00.000Z');
const expiry = '2026-10-24T12:45:00.000Z';
const plan = () => executionReviewPackage(account, 'us-east-1', stack, 'lcm-reviewed-test', expiry, now);

test('one offline package separates eight proposals and hashes exact documents', () => {
  const result = plan();
  assert.equal(result.awsCalls, false);
  assert.equal(result.readyToApply, false);
  assert.equal(result.policies.length, 8);
  assert.equal(result.policies.filter(policy => policy.temporary).length, 5);
  for (const policy of result.policies) {
    assert.ok(policy.characters <= 6144);
    assert.equal(policy.sha256, createHash('sha256').update(JSON.stringify(policy.document)).digest('hex'));
    for (const statement of policy.document.Statement) {
      assert.equal('DateLessThan' in statement.Condition, policy.temporary);
    }
  }
});
test('operator scope uses exact existing stack and name, recovery never grants object deletion', () => {
  const result = plan();
  const execution = result.policies.find(policy => policy.name === 'operator-execution');
  assert.ok(execution);
  assert.ok(JSON.stringify(execution.document).includes(result.stackArn));
  assert.ok(!JSON.stringify(execution.document).includes('lcm-reviewed-*'));
  const recovery = result.policies.find(policy => policy.name === 'executor-bucket-policy-recovery');
  assert.ok(recovery);
  const text = JSON.stringify(recovery.document);
  assert.ok(text.includes('s3:DeleteBucketPolicy'));
  assert.ok(!text.includes('s3:DeleteObject'));
  assert.ok(!text.includes('s3:DeleteBucket"'));
});
test('invalid target, wildcard name and expired windows fail closed', () => {
  assert.throws(() => executionReviewPackage(account, 'us-east-1', '*', 'lcm-reviewed-test', expiry, now));
  assert.throws(() => executionReviewPackage(account, 'us-east-1', stack, 'lcm-reviewed-*', expiry, now));
  assert.throws(() => executionReviewPackage(account, 'us-east-2', stack, 'lcm-reviewed-test', expiry, now));
  assert.throws(() => executionReviewPackage(account, 'us-east-1', stack, 'lcm-reviewed-test', expiry, now + 3600000));
});
