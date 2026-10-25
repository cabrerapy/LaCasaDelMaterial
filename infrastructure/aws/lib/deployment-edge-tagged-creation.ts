import { deploymentEdgeCreation } from './deployment-edge-creation.js';

/** Separate tagged creation proposal; does not grant TagResource dependencies.
 * Request tags do not constrain resource name/count or configuration contents.
 * No permission is applied/combined with the untaggable creation exceptions.
 */
export function deploymentEdgeTaggedCreation(account: string, region: string,
  executorRoleName: string, expiresAt: string, now = Date.now()) {
  const base = deploymentEdgeCreation(account, region, executorRoleName, expiresAt, now).Statement[0]!;
  return { Version: '2012-10-17', Statement: [{
    Sid: 'TemporaryTaggedEdgeCreation', Effect: 'Allow',
    Action: ['cloudfront:CreateDistribution', 'cloudfront:CreateFunction'], Resource: ['*'],
    Condition: { ...base.Condition, StringEquals: { ...base.Condition.StringEquals,
      'aws:RequestTag/Project': 'LaCasaDelMaterial', 'aws:RequestTag/Environment': 'production' } }
  }] };
}
