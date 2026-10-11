import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfigPlan } from '../lib/runtime-config-plan.js';

const target = { bucket: 'offline-lcm-test', expectedBucketOwner: '123456789012', region: 'us-east-1',
  frontendOrigin: 'https://app.example.invalid', stackName: 'Stack', outputKey: 'Config' };
const outputs = { Stack: { Config: JSON.stringify({ authMode: 'cognito', cognito: {
  domain: 'https://offline.auth.us-east-1.amazoncognito.com', clientId: 'offline',
  redirectUri: target.frontendOrigin + '/auth/callback', logoutUri: target.frontendOrigin + '/login'
} }), UnrelatedSecret: 'never-copy' } };

test('review plan limits IAM to one JSON object with HTTPS and never implies deployment', () => {
  const plan = runtimeConfigPlan(outputs, target);
  assert.equal(plan.mode, 'REVIEW_ONLY');
  assert.equal(plan.awsCalls, false);
  assert.equal(plan.deploymentApproved, false);
  assert.deepEqual(plan.publisherPolicy.Statement, [{ Effect: 'Allow', Action: ['s3:PutObject'],
    Resource: ['arn:aws:s3:::offline-lcm-test/runtime-config.json'],
    Condition: { Bool: { 'aws:SecureTransport': 'true' } } }]);
  assert.ok(!JSON.stringify(plan).includes('never-copy'));
  assert.equal(plan.publication.ExpectedBucketOwner, target.expectedBucketOwner);
});
test('rejects credentials, missing target fields and injection instead of widening IAM', () => {
  for (const invalid of [null, {}, { ...target, accessKeyId: 'forbidden' }, { ...target, bucket: '*' },
    { ...target, bucket: 'name/*' }, { ...target, stackName: '' }, { ...target, region: 12 }]) {
    assert.throws(() => runtimeConfigPlan(outputs, invalid));
  }
});
