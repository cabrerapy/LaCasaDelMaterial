import { runtimeResourceNames } from './runtime-resource-names.js';

/** Planning only: no SDK, credentials, archive creation or executable upload. */
export function assetPublicationPlan(account: string, region: string, assetHash: string) {
  runtimeResourceNames(account, region);
  if (!/^[a-f0-9]{64}$/.test(assetHash)) throw new Error('Exact CDK asset hash required');
  const bucket = `cdk-hnb659fds-assets-${account}-${region}`;
  const key = `${assetHash}.zip`;
  return {
    result: 'BLOCKED_PUBLICATION_PLAN_ONLY', readyForPublication: false,
    source: { assemblyDirectory: 'cdk.out-review', relativeDirectory: `asset.${assetHash}`,
      packaging: 'zip', archivePrepared: false,
      integrity: 'CDK asset identity is not the SHA-256 of the final ZIP bytes' },
    destination: { account, region, bucket, key, objectArn: `arn:aws:s3:::${bucket}/${key}` },
    publisher: { selected: false, assumedRole: false,
      note: 'Manifest bootstrap publisher role is not automatically trusted or authorized' },
    permissionsToReview: { s3: ['s3:PutObject on this object only'],
      kms: 'SSE-KMS single PUT requires GenerateDataKey; reader requires Decrypt. Exact key and effective policy unresolved.',
      excluded: ['DeleteObject', 'ListBucket', 'Wildcard KMS grants', 'Runtime data', 'CloudFormation deployment'] },
    requiredControls: [
      'Fresh build/synth and exact manifest/Lambda Code/source agreement',
      'Inspect package for credentials, local data and unrelated files before archiving',
      'Create ZIP locally, verify index.js at archive root, record byte size and SHA-256',
      'Select and review publisher identity, trust and effective permissions independently',
      'Confirm bucket ownership, policy, region and current encryption immediately before publication',
      'alias/aws/s3 without TargetKeyId is not an existing key ARN; do not initialize via DescribeKey implicitly',
      'Review KMS initialization, required grants and costs; explicit separate approval before AWS writes',
      'Review single PUT limits, explicit encryption headers, expected owner and conditional non-overwrite semantics',
      'After approved upload verify metadata, actual KMS ARN and recorded integrity; no automatic retries or overwrite',
      'Publication alone does not authorize deployment or production acceptance'
    ]
  };
}
