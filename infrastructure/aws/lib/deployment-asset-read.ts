import { runtimeResourceNames } from './runtime-resource-names.js';

/** Syntax-only offline proposal. Recheck against a fresh manifest and Lambda Code.
 * No publishing, listing, KMS grant or assertion of remote object ownership.
 */
export function deploymentAssetRead(account: string, region: string, executorRoleName: string, assetHash: string) {
  runtimeResourceNames(account, region);
  if (!/^lcm-production-[a-z0-9-]{1,40}$/.test(executorRoleName) ||
    executorRoleName === 'lcm-production-runtime' || !/^[a-f0-9]{64}$/.test(assetHash)) {
    throw new Error('Explicit executor and exact CDK ZIP hash required');
  }
  const bucket = `cdk-hnb659fds-assets-${account}-${region}`;
  return { Version: '2012-10-17', Statement: [{
    Sid: 'ExecutorReadExactLambdaZip', Effect: 'Allow', Action: ['s3:GetObject'],
    Resource: [`arn:aws:s3:::${bucket}/${assetHash}.zip`],
    Condition: { StringEquals: {
      'aws:PrincipalArn': `arn:aws:iam::${account}:role/${executorRoleName}`,
      'aws:PrincipalAccount': account, 's3:ResourceAccount': account,
      'aws:RequestedRegion': region
    }, Bool: { 'aws:SecureTransport': 'true' } }
  }] };
}
