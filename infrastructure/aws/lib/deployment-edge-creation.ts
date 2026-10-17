import { runtimeResourceNames } from './runtime-resource-names.js';

/** Two exceptional creation actions only; never applied or merged automatically.
 * No project/name/count isolation is supported for these actions. Exact executor
 * principal and a <=1h IAM time window constrain this candidate grant, not other
 * policies or the lifetime of resources created during the window.
 */
export function deploymentEdgeCreation(account: string, region: string,
  executorRoleName: string, expiresAt: string, now = Date.now()) {
  runtimeResourceNames(account, region);
  if (!/^lcm-production-[a-z0-9-]{1,40}$/.test(executorRoleName) ||
    executorRoleName === 'lcm-production-runtime') throw new Error('Explicit dedicated executor role required');
  const expiry = Date.parse(expiresAt);
  if (!Number.isSafeInteger(now) || now < 0 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt) ||
    !Number.isFinite(expiry) || new Date(expiry).toISOString() !== expiresAt ||
    expiry <= now || expiry - now > 60 * 60 * 1000) {
    throw new Error('Explicit future UTC expiration within one hour required');
  }
  return { Version: '2012-10-17', Statement: [{
    Sid: 'TemporaryEdgeCreationExceptions', Effect: 'Allow',
    Action: ['cloudfront:CreateCachePolicy', 'cloudfront:CreateOriginAccessControl'],
    Resource: ['*'], Condition: {
      ArnEquals: { 'aws:PrincipalArn': `arn:aws:iam::${account}:role/${executorRoleName}` },
      StringEquals: { 'aws:PrincipalAccount': account },
      DateGreaterThanEquals: { 'aws:CurrentTime': new Date(now).toISOString() },
      DateLessThan: { 'aws:CurrentTime': expiresAt }
    }
  }] };
}
