import { deploymentEdgeCreation } from './deployment-edge-creation.js';

/** Offline proposal only. Type wildcards can affect unrelated existing resources
 * in this account during the window. No application or automatic renewal.
 * Replace with independently verified exact IDs after creation.
 */
export function deploymentEdgeInitialLifecycle(account: string, region: string,
  executorRoleName: string, expiresAt: string, now = Date.now()) {
  const condition = deploymentEdgeCreation(account, region, executorRoleName, expiresAt, now).Statement[0]!.Condition;
  const prefix = `arn:aws:cloudfront::${account}:`;
  return { Version: '2012-10-17', Statement: [
    { Sid: 'TemporaryAccountDistributionLifecycle', Effect: 'Allow',
      Action: ['cloudfront:GetDistribution', 'cloudfront:GetDistributionConfig',
        'cloudfront:UpdateDistribution', 'cloudfront:DeleteDistribution', 'cloudfront:ListTagsForResource'],
      Resource: [`${prefix}distribution/*`], Condition: structuredClone(condition) },
    { Sid: 'TemporaryAccountCachePolicyLifecycle', Effect: 'Allow',
      Action: ['cloudfront:GetCachePolicy', 'cloudfront:GetCachePolicyConfig',
        'cloudfront:UpdateCachePolicy', 'cloudfront:DeleteCachePolicy'],
      Resource: [`${prefix}cache-policy/*`], Condition: structuredClone(condition) },
    { Sid: 'TemporaryAccountOriginControlLifecycle', Effect: 'Allow',
      Action: ['cloudfront:GetOriginAccessControl', 'cloudfront:GetOriginAccessControlConfig',
        'cloudfront:UpdateOriginAccessControl', 'cloudfront:DeleteOriginAccessControl'],
      Resource: [`${prefix}origin-access-control/*`], Condition: structuredClone(condition) }
  ] };
}
