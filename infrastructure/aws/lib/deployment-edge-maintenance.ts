import { runtimeResourceNames } from './runtime-resource-names.js';

export interface EdgeMaintenanceTarget {
  readonly account: string;
  readonly region: string;
  readonly executorRoleName: string;
  readonly distributionId: string;
  readonly cachePolicyId: string;
  readonly originAccessControlId: string;
}

/** Post-creation candidate only. IDs must be independently verified as LCM-owned.
 * Validation here is syntax, not resource existence, ownership or approval.
 * No fallback wildcard or creation grant when IDs are not yet available.
 */
export function deploymentEdgeMaintenance(target: EdgeMaintenanceTarget) {
  const names = runtimeResourceNames(target.account, target.region);
  if (!/^lcm-production-[a-z0-9-]{1,40}$/.test(target.executorRoleName) ||
    target.executorRoleName === 'lcm-production-runtime' ||
    !/^[A-Z0-9]{1,64}$/.test(target.distributionId) ||
    !/^[A-Z0-9]{1,64}$/.test(target.originAccessControlId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(target.cachePolicyId)) {
    throw new Error('Explicit executor and exact reviewed edge IDs required');
  }
  const prefix = `arn:aws:cloudfront::${target.account}:`;
  const distribution = `${prefix}distribution/${target.distributionId}`;
  const fn = `${prefix}function/${names.edgeFunctionName}`;
  const condition = { ArnEquals: { 'aws:PrincipalArn': `arn:aws:iam::${target.account}:role/${target.executorRoleName}` },
    StringEquals: { 'aws:PrincipalAccount': target.account } };
  return { Version: '2012-10-17', Statement: [
    { Sid: 'ExecutorExactDistributionMaintenance', Effect: 'Allow',
      Action: ['cloudfront:GetDistribution', 'cloudfront:GetDistributionConfig',
        'cloudfront:UpdateDistribution', 'cloudfront:DeleteDistribution'], Resource: [distribution], Condition: condition },
    { Sid: 'ExecutorExactCachePolicyMaintenance', Effect: 'Allow',
      Action: ['cloudfront:GetCachePolicy', 'cloudfront:GetCachePolicyConfig',
        'cloudfront:UpdateCachePolicy', 'cloudfront:DeleteCachePolicy'],
      Resource: [`${prefix}cache-policy/${target.cachePolicyId}`], Condition: condition },
    { Sid: 'ExecutorExactOriginControlMaintenance', Effect: 'Allow',
      Action: ['cloudfront:GetOriginAccessControl', 'cloudfront:GetOriginAccessControlConfig',
        'cloudfront:UpdateOriginAccessControl', 'cloudfront:DeleteOriginAccessControl'],
      Resource: [`${prefix}origin-access-control/${target.originAccessControlId}`], Condition: condition },
    { Sid: 'ExecutorExactRoutingFunctionMaintenance', Effect: 'Allow',
      Action: ['cloudfront:DescribeFunction', 'cloudfront:GetFunction', 'cloudfront:UpdateFunction',
        'cloudfront:PublishFunction', 'cloudfront:DeleteFunction'], Resource: [fn], Condition: condition },
    { Sid: 'ExecutorExactEdgeTags', Effect: 'Allow',
      Action: ['cloudfront:ListTagsForResource', 'cloudfront:TagResource', 'cloudfront:UntagResource'],
      Resource: [distribution, fn], Condition: condition }
  ] };
}
