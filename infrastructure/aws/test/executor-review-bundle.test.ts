import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executorReviewBundle } from '../lib/executor-review-bundle.js';
import { deploymentIamGuardrails } from '../lib/deployment-iam-guardrails.js';
import { deploymentDataPermissions } from '../lib/deployment-data-permissions.js';
import { deploymentStoragePermissions } from '../lib/deployment-storage-permissions.js';
import { deploymentComputePermissions } from '../lib/deployment-compute-permissions.js';
import { deploymentIdentityPermissions } from '../lib/deployment-identity-permissions.js';
import { deploymentApiPermissions } from '../lib/deployment-api-permissions.js';

const target = { account: '123456789012', region: 'us-east-1', runtimeRoleName: 'lcm-production-runtime',
  boundaryName: 'lcm-production-runtime-boundary', executorRoleName: 'lcm-production-cfn-executor' };

test('executor bundle preserves all source statements conditions and explicit denies verbatim', () => {
  const { account, region, runtimeRoleName, boundaryName } = target;
  const expected: unknown[] = [];
  for (const policy of [deploymentIamGuardrails(account, runtimeRoleName, boundaryName), deploymentDataPermissions(account, region),
    deploymentStoragePermissions(account, region), deploymentComputePermissions(account, region),
    deploymentIdentityPermissions(account, region), deploymentApiPermissions(account, region)]) expected.push(...policy.Statement);
  const actual = executorReviewBundle(target).policies.flatMap(p => p.document.Statement);
  assert.deepEqual(actual, expected);
  assert.equal(actual.filter(s => s.Effect === 'Deny').length, 2);
  assert.equal(new Set(actual.map(s => s.Sid)).size, actual.length);
});

test('base bundle partitions below 6144 characters without truncation or loss', () => {
  const bundle = executorReviewBundle(target);
  assert.equal(bundle.policies.length, 2);
  for (const policy of bundle.policies) {
    assert.ok(policy.characters <= 6144);
    assert.equal(policy.characters, JSON.stringify(policy.document).length);
    assert.ok(policy.document.Statement.length > 0);
  }
  assert.equal(bundle.policies.flatMap(p => p.document.Statement).length, 20);
});

test('base proposal stays incomplete and excludes runtime data and temporary edge grants', () => {
  const bundle = executorReviewBundle(target);
  assert.equal(bundle.readyForDeployment, false);
  assert.equal(bundle.result, 'INCOMPLETE_REVIEW_ONLY_NOT_APPLIED');
  assert.ok(bundle.blockers.length > 0);
  const actions = bundle.policies.flatMap(p => p.document.Statement).flatMap(s => s.Action);
  for (const action of ['dynamodb:GetItem', 'dynamodb:PutItem', 's3:GetObject', 's3:PutObject',
    'cloudfront:CreateCachePolicy', 'cloudfront:CreateOriginAccessControl', 'cloudfront:CreateDistribution', 'cloudfront:CreateFunction']) {
    assert.ok(!actions.includes(action));
  }
});

test('bundle rejects same runtime/executor ambiguous accounts and unreviewed regions', () => {
  assert.throws(() => executorReviewBundle({ ...target, executorRoleName: target.runtimeRoleName }));
  assert.throws(() => executorReviewBundle({ ...target, executorRoleName: '*' }));
  assert.throws(() => executorReviewBundle({ ...target, account: '*' }));
  assert.throws(() => executorReviewBundle({ ...target, region: 'us-east-2' }));
});
