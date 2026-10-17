import { runtimeResourceNames } from './runtime-resource-names.js';

/** Candidate compute portion, not complete or authorized for deployment.
 * Code/configuration/policy writes are privileged; no claim of safe code contents.
 * PassRole comes from the separate IAM guardrail; ZIP asset access is separate.
 */
export function deploymentComputePermissions(account: string, region: string) {
  const names = runtimeResourceNames(account, region);
  const fn = `arn:aws:lambda:${region}:${account}:function:${names.functionName}`;
  const log = `arn:aws:logs:${region}:${account}:log-group:${names.logGroup}`;
  const regional = { StringEquals: { 'aws:RequestedRegion': region } };
  return { Version: '2012-10-17', Statement: [
    { Sid: 'ExecutorExactFunctionConfiguration', Effect: 'Allow', Action: [
      'lambda:CreateFunction', 'lambda:GetFunction', 'lambda:GetFunctionConfiguration',
      'lambda:UpdateFunctionCode', 'lambda:UpdateFunctionConfiguration',
      'lambda:PutFunctionConcurrency', 'lambda:DeleteFunction',
      'lambda:TagResource', 'lambda:UntagResource', 'lambda:ListTags',
      'lambda:GetPolicy', 'lambda:RemovePermission'
    ], Resource: [fn], Condition: regional },
    { Sid: 'ExecutorApiGatewayInvocationPermissionOnly', Effect: 'Allow',
      Action: ['lambda:AddPermission'], Resource: [fn], Condition: { StringEquals: {
        'aws:RequestedRegion': region, 'lambda:Principal': 'apigateway.amazonaws.com'
      } } },
    { Sid: 'ExecutorOwnLogGroupConfiguration', Effect: 'Allow',
      Action: ['logs:CreateLogGroup', 'logs:PutRetentionPolicy'],
      Resource: [`${log}:*`], Condition: regional },
    // Logs tagging APIs require the ARN without the trailing :*.
    { Sid: 'ExecutorOwnLogGroupTags', Effect: 'Allow',
      Action: ['logs:TagResource', 'logs:UntagResource', 'logs:ListTagsForResource'],
      Resource: [log], Condition: regional },
    // DescribeLogGroups has no resource-level scope. Metadata only, regional.
    { Sid: 'ExecutorRegionalLogGroupDiscovery', Effect: 'Allow',
      Action: ['logs:DescribeLogGroups'], Resource: ['*'], Condition: regional }
  ] };
}
