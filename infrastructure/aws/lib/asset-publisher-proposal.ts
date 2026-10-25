import { runtimeResourceNames } from './runtime-resource-names.js';

/** Incomplete offline documents. Never create/adopt a role or initialize KMS. */
export function assetPublisherProposal(account: string, region: string, assetHash: string, kmsKeyArn: string) {
  runtimeResourceNames(account, region);
  if (!/^[a-f0-9]{64}$/.test(assetHash)) throw new Error('Exact CDK asset identity required');
  const keyPrefix = `arn:aws:kms:${region}:${account}:key/`;
  if (!kmsKeyArn.startsWith(keyPrefix) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(kmsKeyArn.slice(keyPrefix.length))) {
    throw new Error('Explicit same-account regional KMS key ARN required');
  }
  const roleName = 'lcm-production-asset-publisher';
  const operatorArn = `arn:aws:iam::${account}:user/lcm-admin`;
  const roleArn = `arn:aws:iam::${account}:role/${roleName}`;
  const objectArn = `arn:aws:s3:::cdk-hnb659fds-assets-${account}-${region}/${assetHash}.zip`;
  return {
    result: 'INCOMPLETE_REVIEW_ONLY_NOT_APPLIED', readyForPublication: false,
    roleName, roleArn, operatorArn, kmsKeyArn,
    trustPolicy: { Version: '2012-10-17', Statement: [{
      Sid: 'TrustExactLcmOperator', Effect: 'Allow', Principal: { AWS: operatorArn },
      Action: ['sts:AssumeRole'], Condition: { Bool: { 'aws:SecureTransport': 'true' } }
    }] },
    s3Policy: { Version: '2012-10-17', Statement: [{
      Sid: 'PublishOnlyExactLambdaZip', Effect: 'Allow', Action: ['s3:PutObject'], Resource: [objectArn],
      Condition: { StringEquals: { 'aws:PrincipalArn': roleArn, 'aws:PrincipalAccount': account,
        'aws:RequestedRegion': region, 's3:ResourceAccount': account,
        's3:x-amz-server-side-encryption': 'aws:kms',
        's3:x-amz-server-side-encryption-aws-kms-key-id': kmsKeyArn },
        Null: { 's3:if-none-match': 'false' }, Bool: { 'aws:SecureTransport': 'true' } }
    }] },
    blockers: [
      'No KMS grants: verify actual key ownership/state/policy and effective S3-mediated access independently',
      'Trust/S3 documents need remote validation; custom simulations do not prove effective trust or access',
      'Trust names one user but does not prove fresh MFA; review actual AWS login/session context',
      'Same-account direct user trust can grant AssumeRole without another identity Allow, subject to effective restrictions',
      'S3 Allow requires the exact key ARN header; syntax validation does not prove remote key existence or access',
      'This Allow requires If-None-Match presence; S3 validates the required asterisk value, not the IAM simulator. Review other policies and version/delete-marker semantics',
      'No runtime/executor/CloudFormation/publication bootstrap role assumption or managed policies included',
      'Recheck role absence, bucket policy, ZIP integrity, permissions/boundary/session policies and approval before creation'
    ]
  };
}
