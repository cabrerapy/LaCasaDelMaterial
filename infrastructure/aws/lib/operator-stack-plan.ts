import { executorAuthorityPlan } from './executor-authority-plan.js';

/** Offline operator proposal for the currently synthesized stack name.
 * Verify the regenerated assembly selects the dedicated executor before use.
 * Change-set naming is not approval of template contents or resource ownership.
 */
export function operatorStackPlan(account: string, region: string) {
  const authority = executorAuthorityPlan(account, region);
  const stackName = 'LcmApplicationReview';
  const stackArn = `arn:aws:cloudformation:${region}:${account}:stack/${stackName}/*`;
  const condition = {
    ArnEquals: { 'aws:PrincipalArn': authority.operatorArn },
    StringEquals: { 'aws:PrincipalAccount': account, 'aws:RequestedRegion': region },
    Bool: { 'aws:SecureTransport': 'true' }
  };
  const changeSetName = 'lcm-reviewed-*';
  // Stack ARN only. No changeSet/* grant: ownership cannot be inferred from its name.
  const taggingFor = (operation: 'CreateChangeSet' | 'ExecuteChangeSet') => ({Version:'2012-10-17',Statement:[
    {Sid:`TagNamedStackDuring${operation}`,Effect:'Allow',Action:['cloudformation:TagResource'],
      Resource:[stackArn],Condition:{...structuredClone(condition),StringEquals:{...condition.StringEquals,
        'cloudformation:CreateAction':operation,'aws:RequestTag/Project':'LaCasaDelMaterial',
        'aws:RequestTag/Environment':'production'},
        'ForAllValues:StringEquals':{'aws:TagKeys':['Project','Environment']},
        Null:{'aws:TagKeys':'false'}}},
    {Sid:`UntagNamedOwnedStackDuring${operation}`,Effect:'Allow',Action:['cloudformation:UntagResource'],
      Resource:[stackArn],Condition:{...structuredClone(condition),StringEquals:{...condition.StringEquals,
        'cloudformation:CreateAction':operation,'aws:ResourceTag/Project':'LaCasaDelMaterial',
        'aws:ResourceTag/Environment':'production'},
        'ForAllValues:StringEquals':{'aws:TagKeys':['Project','Environment']},
        Null:{'aws:TagKeys':'false'}}}
  ]});
  const reviewPolicy = {Version:'2012-10-17',Statement:[
    {Sid:'PrepareNamedStackWithExactExecutor',Effect:'Allow',Action:['cloudformation:CreateChangeSet'],
      Resource:[stackArn],Condition:{...structuredClone(condition),ArnEquals:{...condition.ArnEquals,
        'cloudformation:RoleArn':authority.roleArn},StringLike:{'cloudformation:ChangeSetName':changeSetName}}},
    {Sid:'ReadOnlyNamedStackReview',Effect:'Allow',Action:['cloudformation:DescribeStacks',
      'cloudformation:DescribeStackEvents','cloudformation:DescribeStackResources',
      'cloudformation:ListStackResources','cloudformation:GetTemplate','cloudformation:ListChangeSets'],
      Resource:[stackArn],Condition:structuredClone(condition)},
    {Sid:'ReadOnlyNamedChangeSet',Effect:'Allow',Action:['cloudformation:DescribeChangeSet'],
      Resource:[stackArn],Condition:{...structuredClone(condition),StringLike:{'cloudformation:ChangeSetName':changeSetName}}}
  ]};
  const executionPolicy = {Version:'2012-10-17',Statement:[
    {Sid:'ExecuteNamedReviewedChangeSetSeparateApproval',Effect:'Allow',Action:['cloudformation:ExecuteChangeSet'],
      Resource:[stackArn],Condition:{...structuredClone(condition),StringLike:{'cloudformation:ChangeSetName':changeSetName}}}
  ]};
  return {result:'OPERATOR_STACK_PLAN_ONLY_NOT_APPLIED',readyToApply:false,stackName,stackArn,
    operatorArn:authority.operatorArn,executorArn:authority.roleArn,
    reviewPolicy,passRolePolicy:authority.operatorPassRolePolicy,executionPolicy,
    creationTaggingPolicy:taggingFor('CreateChangeSet'),executionTaggingPolicy:taggingFor('ExecuteChangeSet'),
    blockers:[
      'Tagging proposals are separate and unapplied: exact stack only, operation context must be verified',
      'Untag permits removal of Project/Environment only during specified operation on already-tagged stack; ownership labels can then be lost',
      'No changeset-resource tagging permission; a handler targeting changeSet ARN will fail closed pending exact-resource review',
      'Other tag keys, including implicit service-added context, are not assumed; actual workflow remains unverified',
      'Verify regenerated assembly uses dedicated executor with no bootstrap role assumptions; synthesis is not deploy approval',
      'Verify stack absence/ownership and associated role before any change set',
      'Execution policy is separate, not authorized for application; naming does not approve the template',
      'RoleArn condition applies to creation only; ExecuteChangeSet does not support that condition',
      'Inspect actual change-set role/template/changes and privileges of other stack operators before execution',
      'No CreateStack, UpdateStack, DeleteStack, global listing, AssumeRole or direct service provisioning',
      'A CREATE change set can leave a REVIEW_IN_PROGRESS stack; it is an AWS write, not a read-only operation',
      'No rollback/cleanup grants or guaranteed full workflow; cost, dependencies and explicit approvals remain'
    ]};
}
