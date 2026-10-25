import { deploymentEdgeCreation } from '../lib/deployment-edge-creation.js';
import { deploymentEdgeTaggedCreation } from '../lib/deployment-edge-tagged-creation.js';
import { deploymentEdgeFunction } from '../lib/deployment-edge-function.js';
import { deploymentEdgeDistributionTags } from '../lib/deployment-edge-distribution-tags.js';
import { deploymentEdgeInitialLifecycle } from '../lib/deployment-edge-initial-lifecycle.js';

// Offline only. No AWS SDK, credentials, mutation or automatic extension.
try {
  const [account, region, executorRoleName, expiresAt, extra] = process.argv.slice(2);
  if (!account || !region || !executorRoleName || !expiresAt || extra) throw new Error('Explicit scope required');
  const now = Date.now();
  const policy = deploymentEdgeCreation(account, region, executorRoleName, expiresAt, now);
  const taggedPolicy = deploymentEdgeTaggedCreation(account, region, executorRoleName, expiresAt, now);
  const functionLifecyclePolicy = deploymentEdgeFunction(account, region, executorRoleName, expiresAt, now);
  const distributionTaggingPolicy = deploymentEdgeDistributionTags(account, region, executorRoleName, expiresAt, now);
  const initialLifecyclePolicy = deploymentEdgeInitialLifecycle(account, region, executorRoleName, expiresAt, now);
  console.log(JSON.stringify({ result: 'REVIEW_ONLY_NOT_APPLIED', account, region, executorRoleName,
    expiresAt, policy, taggedPolicy, functionLifecyclePolicy, distributionTaggingPolicy, initialLifecyclePolicy, limitations: [
      'Only two creation exceptions; not a complete edge or executor policy',
      'Separate taggedPolicy proposes distribution/function creation with request tags and the same window',
      'Separate functionLifecyclePolicy proposes exact named-function reads/publication/rollback and request-tagged tagging',
      'Separate distributionTaggingPolicy uses account distribution/* and can retag existing distributions during the window; request tags do not prove ownership',
      'Separate initialLifecyclePolicy is local-only: account/type wildcard read/update/delete can affect unrelated existing distributions/cache policies/OACs during the window',
      'No application approval: verify remote review separately and replace initial scopes with independently verified exact IDs after creation',
      'Before granting function lifecycle, verify the exact name is absent; do not adopt an unrelated existing function',
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
