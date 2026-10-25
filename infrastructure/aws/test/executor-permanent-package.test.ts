import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { executorPermanentPackage } from '../lib/executor-permanent-package.js';
const target={account:'123456789012',region:'us-east-1',runtimeRoleName:'lcm-production-runtime',
  boundaryName:'lcm-production-runtime-boundary',executorRoleName:'lcm-production-cfn-executor'};
test('permanent package contains only base partitions and exact ZIP, with reproducible byte hashes',()=>{
  const proposal=executorPermanentPackage(target,'a'.repeat(64));
  assert.equal(proposal.readyToApply,false);
  assert.equal(proposal.policies.length,3);
  for(const policy of proposal.policies){
    assert.equal(policy.sha256,createHash('sha256').update(policy.json,'utf8').digest('hex'));
    assert.ok(policy.characters<=6144);
    assert.ok(!policy.json.includes('cloudfront:'));
    assert.ok(!policy.json.includes('TrustCloudFormationServiceOnly'));
  }
});
test('permanent package rejects invalid asset and equal executor/runtime',()=>{
  assert.throws(()=>executorPermanentPackage(target,'bad'));
  assert.throws(()=>executorPermanentPackage({...target,executorRoleName:target.runtimeRoleName},'a'.repeat(64)));
});
