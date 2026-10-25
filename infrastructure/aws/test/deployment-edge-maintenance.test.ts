import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentEdgeMaintenance } from '../lib/deployment-edge-maintenance.js';
import { runtimeResourceNames } from '../lib/runtime-resource-names.js';

// Synthetic IDs for document tests, never deployment defaults.
const target = { account: '123456789012', region: 'us-east-1', executorRoleName: 'lcm-production-cfn-executor',
  distributionId: 'EREVIEWONLY', originAccessControlId: 'EOACREVIEWONLY',
  cachePolicyId: '11111111-2222-4333-8444-555555555555' };

test('post-creation edge candidate uses exact per-resource ARNs and executor principal', () => {
  const policy = deploymentEdgeMaintenance(target);
  const prefix = `arn:aws:cloudfront::${target.account}:`;
  const resources = new Set(policy.Statement.flatMap(s => s.Resource));
  assert.deepEqual([...resources].sort(), [
    `${prefix}distribution/${target.distributionId}`, `${prefix}cache-policy/${target.cachePolicyId}`,
    `${prefix}origin-access-control/${target.originAccessControlId}`,
    `${prefix}function/${runtimeResourceNames(target.account, target.region).edgeFunctionName}`
  ].sort());
  for (const statement of policy.Statement) {
    assert.equal(statement.Condition.ArnEquals['aws:PrincipalArn'],
      `arn:aws:iam::${target.account}:role/${target.executorRoleName}`);
    assert.equal(statement.Condition.StringEquals['aws:PrincipalAccount'], target.account);
  }
});

test('maintenance contains no wildcard creation listing or cross-service permissions', () => {
  const policy = deploymentEdgeMaintenance(target);
  assert.ok(!JSON.stringify(policy).includes('*'));
  assert.ok(policy.Statement.flatMap(s => s.Action).every(action => action.startsWith('cloudfront:') &&
    !action.startsWith('cloudfront:Create') && !action.startsWith('cloudfront:ListDistributions')));
  const tag = policy.Statement.find(s => s.Sid === 'ExecutorExactEdgeTags')!;
  assert.equal(tag.Resource.length, 2);
  assert.ok(tag.Resource.every(arn => !arn.includes('cache-policy') && !arn.includes('origin-access-control')));
});

test('missing wildcard path and ARN-shaped IDs fail instead of opening resource scope', () => {
  for (const key of ['distributionId', 'cachePolicyId', 'originAccessControlId'] as const) {
    for (const invalid of ['', '*', '../other', 'arn:aws:cloudfront::999999999999:distribution/EOTHER']) {
      assert.throws(() => deploymentEdgeMaintenance({ ...target, [key]: invalid }));
    }
  }
});

test('maintenance rejects runtime role ambiguous account and unreviewed region', () => {
  assert.throws(() => deploymentEdgeMaintenance({ ...target, executorRoleName: 'lcm-production-runtime' }));
  assert.throws(() => deploymentEdgeMaintenance({ ...target, account: '*' }));
  assert.throws(() => deploymentEdgeMaintenance({ ...target, region: 'us-east-2' }));
});
