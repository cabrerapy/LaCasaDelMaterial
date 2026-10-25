import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App, Stack, CfnOutput } from 'aws-cdk-lib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewSynthesizer } from '../lib/review-synthesizer.js';

test('review assembly selects only dedicated CloudFormation executor, with no bootstrap assumptions',()=>{
  const app=new App();
  const stack=new Stack(app,'LcmApplicationReview',{env:{account:'123456789012',region:'us-east-1'},
    synthesizer:reviewSynthesizer('123456789012','us-east-1')});
  new CfnOutput(stack,'OfflineOnly',{value:'not-deployed'});
  const assembly=app.synth();
  const artifact=assembly.getStackArtifact(stack.artifactId);
  assert.equal(artifact.cloudFormationExecutionRoleArn,'arn:aws:iam::123456789012:role/lcm-production-cfn-executor');
  assert.ok(!artifact.assumeRoleArn);
  const manifest=JSON.stringify(assembly.manifest);
  assert.ok(!manifest.includes('cdk-hnb659fds-cfn-exec-role'));
  assert.ok(!manifest.includes('cdk-hnb659fds-deploy-role'));
  assert.ok(!manifest.includes('cdk-hnb659fds-lookup-role'));
  const assets=readFileSync(join(assembly.directory,'LcmApplicationReview.assets.json'),'utf8');
  assert.ok(!assets.includes('assumeRoleArn'));
  assert.ok(!assets.includes('file-publishing-role'));
  assert.ok(assets.includes('cdk-hnb659fds-assets-123456789012-us-east-1'));
});
test('review synthesizer fails closed for invalid target',()=>{
  assert.throws(()=>reviewSynthesizer('bad','us-east-1'));
  assert.throws(()=>reviewSynthesizer('123456789012','us-east-2'));
});
