import { runtimeResourceNames } from './runtime-resource-names.js';

/** Offline configuration-only proposal, not deployment authorization.
 * Bucket-policy/configuration writes are privileged: exact ARNs do not constrain
 * their contents or prove private access. Review template and effective controls.
 * No object publication, evidence access, bootstrap assets or deletion permissions.
 */
export function deploymentStoragePermissions(account: string, region: string) {
  const names = runtimeResourceNames(account, region);
  const resources = [names.frontendBucket, names.evidenceBucket].map(name => `arn:aws:s3:::${name}`);
  return { Version: '2012-10-17', Statement: [
    { Sid: 'ExecutorCreateExactBuckets', Effect: 'Allow', Action: ['s3:CreateBucket'],
      Resource: resources, Condition: { StringEquals: { 'aws:RequestedRegion': region } } },
    { Sid: 'ExecutorConfigureOwnedBuckets', Effect: 'Allow', Action: [
      's3:GetBucketLocation', 's3:GetBucketAcl', 's3:GetBucketOwnershipControls',
      's3:GetBucketPublicAccessBlock', 's3:GetEncryptionConfiguration',
      's3:GetBucketTagging', 's3:GetBucketPolicy',
      's3:PutBucketOwnershipControls', 's3:PutBucketPublicAccessBlock',
      's3:PutEncryptionConfiguration', 's3:PutBucketTagging', 's3:PutBucketPolicy'
    ], Resource: resources, Condition: { StringEquals: {
      'aws:RequestedRegion': region, 's3:ResourceAccount': account
    } } }
  ] };
}
