import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetPublicationPlan } from '../lib/asset-publication-plan.js';

test('publication plan names one exact ZIP without selecting a publisher or preparing bytes', () => {
  const hash = 'a'.repeat(64);
  const plan = assetPublicationPlan('123456789012', 'us-east-1', hash);
  assert.equal(plan.destination.objectArn, `arn:aws:s3:::cdk-hnb659fds-assets-123456789012-us-east-1/${hash}.zip`);
  assert.equal(plan.source.relativeDirectory, `asset.${hash}`);
  assert.equal(plan.source.archivePrepared, false);
  assert.equal(plan.publisher.selected, false);
  assert.equal(plan.publisher.assumedRole, false);
});

test('publication plan remains blocked and contains no IAM policy or upload command', () => {
  const plan = assetPublicationPlan('123456789012', 'us-east-1', 'a'.repeat(64));
  assert.equal(plan.result, 'BLOCKED_PUBLICATION_PLAN_ONLY');
  assert.equal(plan.readyForPublication, false);
  assert.ok(plan.requiredControls.length >= 10);
  assert.ok(!Object.hasOwn(plan, 'policy'));
  assert.ok(!Object.hasOwn(plan, 'command'));
});

test('publication plan refuses unresolved targets and path-like or wildcard asset identities', () => {
  for (const hash of ['', '*', '../asset', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(64) + '.zip']) {
    assert.throws(() => assetPublicationPlan('123456789012', 'us-east-1', hash));
  }
  assert.throws(() => assetPublicationPlan('*', 'us-east-1', 'a'.repeat(64)));
  assert.throws(() => assetPublicationPlan('123456789012', 'us-east-2', 'a'.repeat(64)));
});
