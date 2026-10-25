import { createHash } from 'node:crypto';
import { operatorStackPlan } from './operator-stack-plan.js';

/** Exact review-stage documents only. Not an AWS write or deploy authorization. */
export function operatorReviewPackage(account: string, region: string) {
  const plan=operatorStackPlan(account,region);
  const sources=[
    {name:'lcm-production-operator-stack-review',document:plan.reviewPolicy},
    {name:'lcm-production-operator-pass-executor',document:plan.passRolePolicy},
    {name:'lcm-production-operator-creation-tags',document:plan.creationTaggingPolicy}
  ];
  return {result:'OPERATOR_REVIEW_PACKAGE_ONLY',readyToApply:false,operatorArn:plan.operatorArn,
    executorArn:plan.executorArn,stackName:plan.stackName,
    policies:sources.map(source=>{
      const json=JSON.stringify(source.document);
      if(json.length>6144) throw new Error('Policy too large');
      return {name:source.name,filename:`${source.name}.json`,characters:json.length,
        sha256:createHash('sha256').update(json,'utf8').digest('hex'),json};
    }),
    excluded:['ExecuteChangeSet and execution-stage tagging','CloudFront temporary policies',
      'Template/asset publishing','Executor trust and runtime boundary'],
    limitations:['Not an explicit deny: existing operator policies must be reviewed independently',
      'Creating a change set is a write and can leave a REVIEW_IN_PROGRESS stack; separate approval required',
      'Untag can remove ownership labels during CreateChangeSet on an already-labelled stack',
      'Exact stack ownership, role, manifest/template, dependencies and effective permission checks required',
      'No automatic application, adoption, overwrite, retry or cleanup']};
}
