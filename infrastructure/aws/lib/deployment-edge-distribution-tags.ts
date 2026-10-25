import { deploymentEdgeCreation } from './deployment-edge-creation.js';

/** Offline exception proposal only. Unknown IDs require account distribution/*.
 * Request tags do not prove ownership: existing distributions can be retagged
 * during the window. Never treat this as project-isolated or apply implicitly.
 */
export function deploymentEdgeDistributionTags(account: string, region: string,
  executorRoleName: string, expiresAt: string, now = Date.now()) {
  const base = deploymentEdgeCreation(account, region, executorRoleName, expiresAt, now).Statement[0]!;
  return { Version: '2012-10-17', Statement: [{
    Sid: 'TemporaryAccountDistributionCreationTags', Effect: 'Allow',
    Action: ['cloudfront:TagResource'],
    Resource: [`arn:aws:cloudfront::${account}:distribution/*`],
    Condition: { ...structuredClone(base.Condition), StringEquals: {
      ...base.Condition.StringEquals, 'aws:RequestTag/Project': 'LaCasaDelMaterial',
      'aws:RequestTag/Environment': 'production'
    }, 'ForAllValues:StringEquals': { 'aws:TagKeys': ['Project', 'Environment'] } }
  }] };
}
