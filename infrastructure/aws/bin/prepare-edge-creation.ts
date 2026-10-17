import { deploymentEdgeCreation } from '../lib/deployment-edge-creation.js';

// Offline only. No AWS SDK, credentials, mutation or automatic extension.
try {
  const [account, region, executorRoleName, expiresAt, extra] = process.argv.slice(2);
  if (!account || !region || !executorRoleName || !expiresAt || extra) throw new Error('Explicit scope required');
  const policy = deploymentEdgeCreation(account, region, executorRoleName, expiresAt);
  console.log(JSON.stringify({ result: 'REVIEW_ONLY_NOT_APPLIED', account, region, executorRoleName,
    expiresAt, policy, limitations: [
      'Only two creation exceptions; not a complete edge or executor policy',
      'No project, name or resource-count isolation within these creation actions',
      'Executor existence/trust, effective policies, remote validation and approval are not verified',
      'Expiration stops this grant, not other permissions; policy removal must be separately verified',
      'Created resources persist after expiration and may continue to incur costs',
      'Record created IDs and review exact-ARN read/update/rollback permissions separately'
    ] }, null, 2));
} catch {
  console.error('Expected account, us-east-1, dedicated LCM executor role and UTC expiration within one hour. No AWS changes made.');
  process.exitCode = 1;
}
