import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remainingAuthorityReview } from '../lib/remaining-authority-review.js';
const now = Date.parse('2026-10-28T14:00:00.000Z');
const make = () => remainingAuthorityReview('088668667831', 'us-east-1',
  'b2b93cb0-d0dd-11f1-a355-0e392e77eda7', '2026-10-28T14:45:00.000Z', now);
test('remaining authority contains six managed updates and one separate Logs inline proposal', () => {
  const p = make();
  assert.equal(p.readyToApply, false);
  assert.equal(p.awsCalls, false);
  assert.equal(p.policies.length, 7);
  assert.equal(p.policies.filter(x => x.kind === 'existing-managed-default-version').length, 6);
  assert.ok(p.policies.every(x => !x.name.includes('operator') && !x.name.includes('s3')));
  const api = p.policies.find(x => x.name.endsWith('initial-tagging'))!;
  assert.ok(!JSON.stringify(api.document).includes('cognito-idp'));
  assert.ok(JSON.stringify(api.document).includes('apigateway:POST'));
  const logs = p.policies.find(x => x.kind === 'new-executor-inline')!;
  assert.ok(JSON.stringify(logs.document).includes('logs:TagLogGroup'));
  for (const policy of p.policies) {
    assert.match(policy.sha256, /^[0-9a-f]{64}$/);
    assert.ok(JSON.stringify(policy.document).includes('2026-10-28T14:45:00.000Z'));
  }
});
test('remaining authority refuses broad stack identifiers and overlong windows', () => {
  assert.throws(() => remainingAuthorityReview('088668667831', 'us-east-1', '*', '2026-10-28T14:45:00.000Z', now));
  assert.throws(() => remainingAuthorityReview('088668667831', 'us-east-1', 'b2b93cb0-d0dd-11f1-a355-0e392e77eda7', '2026-10-28T16:00:00.000Z', now));
});
