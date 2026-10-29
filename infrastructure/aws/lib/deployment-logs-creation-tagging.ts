import { deploymentEdgeCreation } from './deployment-edge-creation.js';
import { runtimeResourceNames } from './runtime-resource-names.js';

/** Separate candidate, not a change to already-applied compute policies.
 * CreateLogGroup supports TagLogGroup as an alternative for initial tags.
 * This remains unproven against the real creation handler until explicitly tested.
 */
export function deploymentLogsCreationTagging(account: string, region: string, expiresAt: string, now = Date.now()) {
  const names = runtimeResourceNames(account, region);
  const window = deploymentEdgeCreation(account, region, 'lcm-production-cfn-executor', expiresAt, now)
    .Statement[0]!.Condition;
  return { result: 'LOGS_CREATION_TAGGING_CANDIDATE_NOT_APPLIED', readyToApply: false,
    document: { Version: '2012-10-17', Statement: [{
      Sid: 'TemporaryExactLogGroupCreationTagging', Effect: 'Allow', Action: ['logs:TagLogGroup'],
      Resource: [`arn:aws:logs:${region}:${account}:log-group:${names.logGroup}:*`],
      Condition: { ...window, StringEquals: { ...window.StringEquals, 'aws:RequestedRegion': region },
        Bool: { 'aws:SecureTransport': 'true' } }
    }] },
    risks: ['Can change tags of this exact existing log group during the window; not create-only',
      'Does not replace existing bare-ARN TagResource authorization',
      'No log content read/write, group deletion, wildcard groups or automatic renewal',
      'Validate remotely and obtain approval before application or controlled creation'] };
}
