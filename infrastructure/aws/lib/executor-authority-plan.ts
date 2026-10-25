import { runtimeResourceNames } from './runtime-resource-names.js';

/** Authority path only: not an executor permissions policy or deployment grant. */
export function executorAuthorityPlan(account: string, region: string) {
  runtimeResourceNames(account, region);
  const roleName = 'lcm-production-cfn-executor';
  const roleArn = `arn:aws:iam::${account}:role/${roleName}`;
  const operatorArn = `arn:aws:iam::${account}:user/lcm-admin`;
  return {
    result: 'INCOMPLETE_EXECUTOR_AUTHORITY_REVIEW_ONLY', readyForDeployment: false,
    roleName, roleArn, operatorArn,
    trustPolicy: { Version: '2012-10-17', Statement: [{
      Sid: 'TrustCloudFormationServiceOnly', Effect: 'Allow',
      Principal: { Service: 'cloudformation.amazonaws.com' }, Action: ['sts:AssumeRole']
    }] },
    operatorPassRolePolicy: { Version: '2012-10-17', Statement: [{
      Sid: 'PassOnlyLcmExecutorToCloudFormation', Effect: 'Allow',
      Action: ['iam:PassRole'], Resource: [roleArn], Condition: {
        ArnEquals: { 'aws:PrincipalArn': operatorArn },
        StringEquals: { 'iam:PassedToService': 'cloudformation.amazonaws.com', 'aws:PrincipalAccount': account },
        Bool: { 'aws:SecureTransport': 'true' }
      }
    }] },
    blockers: [
      'No executor role created, policies attached or operator grants applied',
      'No CloudFormation stack actions or deployment authorization included',
      'Service trust is not restricted to a unique stack; no unverified SourceArn condition invented',
      'Review stack-operation access: a stack retains its service role and other operators can use it without another PassRole check',
      'Do not let lcm-admin assume this role directly or reuse the administrator bootstrap executor',
      'Complete executor lifecycle/rollback/tagging/ZIP-read and independent runtime boundary first',
      'Validate trust as IAM resource policy and PassRole as identity policy; simulate separately',
      'Cost, quotas, secure bootstrap and explicit creation/deployment approval remain separate'
    ]
  };
}
