import { deploymentEdgeMaintenance } from '../lib/deployment-edge-maintenance.js';

// Public IDs only. No SDK, existence check or writes.
try {
  const [account, region, executorRoleName, distributionId, cachePolicyId, originAccessControlId, extra] = process.argv.slice(2);
  if (!account || !region || !executorRoleName || !distributionId || !cachePolicyId || !originAccessControlId || extra) {
    throw new Error('Explicit target required');
  }
  const target = { account, region, executorRoleName, distributionId, cachePolicyId, originAccessControlId };
  console.log(JSON.stringify({ result: 'REVIEW_ONLY_NOT_APPLIED', target,
    policy: deploymentEdgeMaintenance(target), limitations: [
      'IDs must be independently checked against actual account and LCM stack outputs',
      'This generator verifies syntax only, not ownership, trust, effective permissions or approval',
      'Post-creation candidate with privileged update/delete operations, not bootstrap permission',
      'Remote validation, dependency/rollback review and separate application approval required'
    ] }, null, 2));
} catch {
  console.error('Expected account, us-east-1, LCM executor role and exact distribution/cache-policy/OAC IDs. No AWS changes made.');
  process.exitCode = 1;
}
