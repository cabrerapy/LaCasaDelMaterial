import { executorAttachmentPlan } from '../lib/executor-attachment-plan.js';
try {
  const [account, region, runtimeRoleName, boundaryName, executorRoleName, assetHash, expiresAt, extra] = process.argv.slice(2);
  if (!account || !region || !runtimeRoleName || !boundaryName || !executorRoleName || !assetHash || !expiresAt || extra) {
    throw new Error('Explicit attachment review target required');
  }
  console.log(JSON.stringify(executorAttachmentPlan({account,region,runtimeRoleName,boundaryName,executorRoleName},
    assetHash,expiresAt), null, 2));
} catch {
  console.error('Explicit target, ZIP hash and UTC expiration within one hour required. No AWS changes made.');
  process.exitCode = 1;
}
