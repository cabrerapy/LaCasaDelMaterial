import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentInitialTagging } from '../lib/deployment-initial-tagging.js';
const now = Date.parse('2026-10-25T14:00:00.000Z');
const plan = () => deploymentInitialTagging('123456789012', 'us-east-1', '2026-10-25T14:45:00.000Z', now);
test('initial tagging proposal covers only observed pool and encoded HTTP V2 paths', () => {
  const p = plan();
  assert.equal(p.readyToApply, false);
  assert.equal(p.document.Statement.length, 2);
  assert.deepEqual(p.document.Statement[0]!.Action, ['cognito-idp:TagResource']);
  assert.equal(p.document.Statement[0]!.Resource[0], 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/*');
  assert.equal(p.document.Statement[1]!.Resource[0], 'arn:aws:apigateway:us-east-1::/tags/arn%3Aaws%3Aapigateway%3Aus-east-1%3A%3A%2Fv2%2Fapis%2F*');
  assert.ok(!JSON.stringify(p.document).includes('Untag'));
});
test('both statements require exact executor, request tags, region, HTTPS and short window', () => {
  for (const s of plan().document.Statement) {
    assert.equal(s.Condition.ArnEquals['aws:PrincipalArn'], 'arn:aws:iam::123456789012:role/lcm-production-cfn-executor');
    assert.equal(s.Condition.StringEquals['aws:RequestedRegion'], 'us-east-1');
    assert.equal(s.Condition.StringEquals['aws:RequestTag/Project'], 'LaCasaDelMaterial');
    assert.equal(s.Condition.Bool['aws:SecureTransport'], 'true');
    assert.ok(s.Condition.DateLessThan['aws:CurrentTime']);
  }
  assert.throws(() => deploymentInitialTagging('123456789012', 'us-east-2', '2026-10-25T14:45:00.000Z', now));
  assert.throws(() => deploymentInitialTagging('123456789012', 'us-east-1', '2026-10-25T14:45:00.000Z', now + 3600000));
});
