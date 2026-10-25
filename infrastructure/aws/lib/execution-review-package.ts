import { createHash } from 'node:crypto';
import { operatorStackPlan } from './operator-stack-plan.js';
import { runtimeResourceNames } from './runtime-resource-names.js';
import { deploymentEdgeCreation } from './deployment-edge-creation.js';
import { deploymentEdgeTaggedCreation } from './deployment-edge-tagged-creation.js';
import { deploymentEdgeFunction } from './deployment-edge-function.js';
import { deploymentEdgeDistributionTags } from './deployment-edge-distribution-tags.js';
import { deploymentEdgeInitialLifecycle } from './deployment-edge-initial-lifecycle.js';

/** Offline review package, never approval or an AWS write path. */
export function executionReviewPackage(account: string, region: string, stackId: string,
  changeSetName: string, expiresAt: string, now = Date.now()) {
  const names = runtimeResourceNames(account, region);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(stackId) ||
    !/^lcm-reviewed-[a-zA-Z0-9-]{1,100}$/.test(changeSetName)) throw new Error('Exact stack ID and change-set name required');
  const operator = operatorStackPlan(account, region);
  const stackArn = `arn:aws:cloudformation:${region}:${account}:stack/${operator.stackName}/${stackId}`;
  const execution = structuredClone(operator.executionPolicy);
  for (const statement of execution.Statement) {
    statement.Resource = [stackArn];
    statement.Condition.StringLike['cloudformation:ChangeSetName'] = changeSetName;
  }
  const tags = structuredClone(operator.executionTaggingPolicy);
  for (const statement of tags.Statement) statement.Resource = [stackArn];
  const recovery = { Version: '2012-10-17', Statement: [{
    Sid: 'RemoveOnlyApplicationBucketPoliciesForRecovery', Effect: 'Allow', Action: ['s3:DeleteBucketPolicy'],
    Resource: [names.frontendBucket, names.evidenceBucket].map(bucket => `arn:aws:s3:::${bucket}`),
    Condition: { ArnEquals: { 'aws:PrincipalArn': operator.executorArn },
      StringEquals: { 'aws:PrincipalAccount': account, 'aws:RequestedRegion': region, 's3:ResourceAccount': account },
      Bool: { 'aws:SecureTransport': 'true' } }
  }] };
  const edge = [account, region, 'lcm-production-cfn-executor', expiresAt, now] as const;
  const entries = [
    { name: 'operator-execution', principal: operator.operatorArn, temporary: false, document: execution },
    { name: 'operator-execution-tags', principal: operator.operatorArn, temporary: false, document: tags },
    { name: 'executor-bucket-policy-recovery', principal: operator.executorArn, temporary: false, document: recovery },
    ...[
      { name: 'edge-create', document: deploymentEdgeCreation(...edge) },
      { name: 'edge-tagged-create', document: deploymentEdgeTaggedCreation(...edge) },
      { name: 'edge-function', document: deploymentEdgeFunction(...edge) },
      { name: 'edge-distribution-tags', document: deploymentEdgeDistributionTags(...edge) },
      { name: 'edge-initial-lifecycle', document: deploymentEdgeInitialLifecycle(...edge) }
    ].map(entry => ({ ...entry, principal: operator.executorArn, temporary: true }))
  ];
  return { result: 'EXECUTION_REVIEW_ONLY_NOT_APPLIED', readyToApply: false, awsCalls: false,
    stackArn, changeSetName, expiresAt,
    policies: entries.map(entry => {
      const json = JSON.stringify(entry.document);
      if (json.length > 6144) throw new Error('Policy size limit exceeded');
      return { ...entry, characters: json.length, sha256: createHash('sha256').update(json).digest('hex') };
    }),
    requiredChecks: [
      'Verify actual change-set ID/template/role, effective Lambda quota and fresh resource inventory',
      'Validate and simulate these exact documents, then obtain grouped application approval',
      'Edge account/type wildcards can modify/delete unrelated existing resources during the window',
      'Bucket policy recovery can remove access restrictions; it is not data deletion authority',
      'Untag requires existing ownership tags; initial stack currently lacks them; fail closed if required',
      'Expiration does not remove policies/resources or cover grants from other policies',
      'No automatic renewal, recovery mutation, publishing or execution; separate deployment approval required'
    ] };
}
