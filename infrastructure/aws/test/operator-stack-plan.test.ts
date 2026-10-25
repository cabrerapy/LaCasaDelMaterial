import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatorStackPlan } from '../lib/operator-stack-plan.js';
const plan=()=>operatorStackPlan('123456789012','us-east-1');
test('operator stack proposal uses exact stack name account region and operator',()=>{
  const p=plan();
  assert.equal(p.readyToApply,false);
  assert.equal(p.stackName,'LcmApplicationReview');
  for(const s of [...p.reviewPolicy.Statement,...p.executionPolicy.Statement]){
    assert.deepEqual(s.Resource,['arn:aws:cloudformation:us-east-1:123456789012:stack/LcmApplicationReview/*']);
    assert.equal(s.Condition.ArnEquals['aws:PrincipalArn'],'arn:aws:iam::123456789012:user/lcm-admin');
    assert.equal(s.Condition.StringEquals['aws:RequestedRegion'],'us-east-1');
    assert.equal(s.Condition.Bool['aws:SecureTransport'],'true');
  }
});
test('change set preparation requires exact executor and execution remains separate',()=>{
  const p=plan();
  const create=p.reviewPolicy.Statement[0]!;
  assert.ok('cloudformation:RoleArn' in create.Condition.ArnEquals);
  assert.ok('StringLike' in create.Condition);
  assert.equal(create.Condition.ArnEquals['cloudformation:RoleArn'],p.executorArn);
  assert.deepEqual(create.Condition.StringLike,{'cloudformation:ChangeSetName':'lcm-reviewed-*'});
  assert.ok(!p.reviewPolicy.Statement.flatMap(s=>s.Action).includes('cloudformation:ExecuteChangeSet'));
  assert.ok(!('cloudformation:RoleArn' in p.executionPolicy.Statement[0]!.Condition.ArnEquals));
  const text=JSON.stringify([p.reviewPolicy,p.executionPolicy,p.passRolePolicy]);
  for(const action of ['CreateStack','UpdateStack','DeleteStack','ListStacks','AssumeRole']){
    assert.ok(!text.includes(`:${action}"`));
  }
});
test('operator stack proposal rejects invalid account and unsupported region',()=>{
  assert.throws(()=>operatorStackPlan('bad','us-east-1'));
  assert.throws(()=>operatorStackPlan('123456789012','us-east-2'));
});
test('tagging proposals require exact operation, stack, tag keys and explicit non-null context',()=>{
  const p=plan();
  for(const [operation,policy] of [['CreateChangeSet',p.creationTaggingPolicy],['ExecuteChangeSet',p.executionTaggingPolicy]] as const){
    assert.equal(policy.Statement.length,2);
    for(const s of policy.Statement){
      assert.deepEqual(s.Resource,[p.stackArn]);
      assert.equal(s.Condition.StringEquals['cloudformation:CreateAction'],operation);
      assert.deepEqual(s.Condition['ForAllValues:StringEquals'],{'aws:TagKeys':['Project','Environment']});
      assert.deepEqual(s.Condition.Null,{'aws:TagKeys':'false'});
    }
    assert.deepEqual(policy.Statement.map(s=>s.Action),[['cloudformation:TagResource'],['cloudformation:UntagResource']]);
    assert.ok(!JSON.stringify(policy).includes(':changeSet/'));
    assert.ok(JSON.stringify(policy.Statement[0]).includes('aws:RequestTag/Project'));
    assert.ok(JSON.stringify(policy.Statement[1]).includes('aws:ResourceTag/Project'));
  }
});
