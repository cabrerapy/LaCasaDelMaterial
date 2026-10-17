import { runtimeResourceNames } from './runtime-resource-names.js';

/** Candidate only: tag-based ownership is not a unique resource identity.
 * CloudFormation tag-on-create authorization/dependencies need remote validation.
 * No administrative user lifecycle, invitation, authentication or pool deletion.
 */
export function deploymentIdentityPermissions(account: string, region: string) {
  runtimeResourceNames(account, region);
  const poolScope = `arn:aws:cognito-idp:${region}:${account}:userpool/${region}_*`;
  const owned = { StringEquals: { 'aws:RequestedRegion': region,
    'aws:ResourceTag/Project': 'LaCasaDelMaterial', 'aws:ResourceTag/Environment': 'production' } };
  return { Version: '2012-10-17', Statement: [
    // Cognito does not support a resource ARN for CreateUserPool.
    { Sid: 'ExecutorCreateTaggedPool', Effect: 'Allow', Action: ['cognito-idp:CreateUserPool'],
      Resource: ['*'], Condition: { StringEquals: { 'aws:RequestedRegion': region,
        'aws:RequestTag/Project': 'LaCasaDelMaterial', 'aws:RequestTag/Environment': 'production' } } },
    { Sid: 'ExecutorConfigureTaggedPools', Effect: 'Allow', Action: [
      'cognito-idp:DescribeUserPool', 'cognito-idp:UpdateUserPool',
      'cognito-idp:GetUserPoolMfaConfig', 'cognito-idp:SetUserPoolMfaConfig',
      'cognito-idp:ListTagsForResource', 'cognito-idp:CreateUserPoolClient',
      'cognito-idp:DescribeUserPoolClient', 'cognito-idp:UpdateUserPoolClient',
      'cognito-idp:DeleteUserPoolClient', 'cognito-idp:ListUserPoolClients',
      'cognito-idp:CreateUserPoolDomain', 'cognito-idp:UpdateUserPoolDomain',
      'cognito-idp:DeleteUserPoolDomain'
    ], Resource: [poolScope], Condition: owned },
    // No permission to adopt an untagged/foreign-project existing pool by tagging it.
    // Whether these conditions satisfy tag-on-create is deliberately unverified.
    { Sid: 'ExecutorTagAlreadyOwnedPools', Effect: 'Allow',
      Action: ['cognito-idp:TagResource', 'cognito-idp:UntagResource'],
      Resource: [poolScope], Condition: owned },
    // This metadata API does not support resource-level authorization.
    { Sid: 'ExecutorRegionalDomainDiscovery', Effect: 'Allow',
      Action: ['cognito-idp:DescribeUserPoolDomain'], Resource: ['*'],
      Condition: { StringEquals: { 'aws:RequestedRegion': region } } }
  ] };
}
