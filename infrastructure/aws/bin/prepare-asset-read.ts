import { deploymentAssetRead } from '../lib/deployment-asset-read.js';

try {
  const [account, region, executorRoleName, assetHash, extra] = process.argv.slice(2);
  if (!account || !region || !executorRoleName || !assetHash || extra) throw new Error('Explicit target required');
  console.log(JSON.stringify({ result: 'INCOMPLETE_REVIEW_ONLY_NOT_APPLIED', readyForDeployment: false,
    policy: deploymentAssetRead(account, region, executorRoleName, assetHash), limitations: [
      'Compare hash and bucket with fresh CDK manifest and Lambda Code before use',
      'Remote existence, ownership, encryption and effective access have not been verified',
      'No KMS permissions: review actual object encryption before deciding dependencies',
      'Unversioned GetObject only; does not pin or prove uploaded bytes or prevent publisher replacement',
      'No publishing, bucket listing, role assumption or AWS changes',
      'Separate remote validation, dependency review and application approval required'
    ] }, null, 2));
} catch {
  console.error('Expected account, us-east-1, explicit LCM executor role and 64-character lowercase CDK asset hash. No AWS changes made.');
  process.exitCode = 1;
}
