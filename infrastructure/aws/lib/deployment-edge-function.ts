import { deploymentEdgeCreation } from './deployment-edge-creation.js';
import { runtimeResourceNames } from './runtime-resource-names.js';

/** Separate first-lifecycle proposal for one named function, never applied.
 * Creation remains separate. Exact name does not prove absence/ownership.
 */
export function deploymentEdgeFunction(account: string, region: string, executorRoleName: string,
  expiresAt: string, now = Date.now()) {
  const names = runtimeResourceNames(account, region);
  const window = deploymentEdgeCreation(account, region, executorRoleName, expiresAt, now).Statement[0]!.Condition;
  const resource = `arn:aws:cloudfront::${account}:function/${names.edgeFunctionName}`;
  return { Version: '2012-10-17', Statement: [
    { Sid: 'TemporaryExactSpaFunctionLifecycle', Effect: 'Allow',
      Action: ['cloudfront:DescribeFunction','cloudfront:GetFunction','cloudfront:UpdateFunction',
        'cloudfront:PublishFunction','cloudfront:DeleteFunction','cloudfront:ListTagsForResource'],
      Resource: [resource], Condition: structuredClone(window) },
    { Sid: 'TemporaryExactSpaFunctionCreationTags', Effect: 'Allow', Action: ['cloudfront:TagResource'],
      Resource: [resource], Condition: { ...structuredClone(window), StringEquals: {
        ...window.StringEquals, 'aws:RequestTag/Project':'LaCasaDelMaterial',
        'aws:RequestTag/Environment':'production'
      } } }
  ] };
}
