import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { operatorReviewPackage } from '../lib/operator-review-package.js';
import { operatorStackPlan } from '../lib/operator-stack-plan.js';
test('operator package preserves reviewed documents and excludes execution authority',()=>{
  const p=operatorReviewPackage('123456789012','us-east-1');
  const plan=operatorStackPlan('123456789012','us-east-1');
  assert.equal(p.readyToApply,false);
  assert.deepEqual(p.policies.map(d=>JSON.parse(d.json)),[plan.reviewPolicy,plan.passRolePolicy,plan.creationTaggingPolicy]);
  for(const policy of p.policies){
    assert.equal(policy.sha256,createHash('sha256').update(policy.json).digest('hex'));
    assert.ok(policy.characters<=6144);
    assert.ok(!policy.json.includes('cloudformation:ExecuteChangeSet'));
    assert.ok(!policy.json.includes('cloudfront:'));
    assert.ok(!policy.json.includes(':CreateStack'));
    assert.ok(!policy.json.includes(':DeleteStack'));
  }
});
test('operator package validates account and region before generating documents',()=>{
  assert.throws(()=>operatorReviewPackage('bad','us-east-1'));
  assert.throws(()=>operatorReviewPackage('123456789012','us-east-2'));
});
