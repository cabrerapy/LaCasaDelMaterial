import { runtimeResourceNames } from './runtime-resource-names.js';

/** Candidate DynamoDB portion only. Not a complete executor policy.
 * No data-plane, deletion, replication, import or resource-policy mutation grants.
 * Updates/rollback still need handler validation before deployment authorization.
 */
export function deploymentDataPermissions(account: string, region: string) {
  const names = runtimeResourceNames(account, region);
  const resources = Object.values(names.tables).map(name =>
    `arn:aws:dynamodb:${region}:${account}:table/${name}`);
  return { Version: '2012-10-17', Statement: [{
    Sid: 'ExecutorExactTableConfigurationOnly', Effect: 'Allow',
    Action: ['dynamodb:CreateTable', 'dynamodb:DescribeTable',
      'dynamodb:DescribeContinuousBackups', 'dynamodb:DescribeContributorInsights',
      'dynamodb:DescribeKinesisStreamingDestination', 'dynamodb:DescribeTimeToLive',
      'dynamodb:GetResourcePolicy', 'dynamodb:ListTagsOfResource',
      'dynamodb:UpdateTable', 'dynamodb:UpdateContinuousBackups',
      'dynamodb:TagResource', 'dynamodb:UntagResource'],
    Resource: resources,
    Condition: { StringEquals: { 'aws:RequestedRegion': region } }
  }] };
}
