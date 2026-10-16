/** IAM portion only, NOT a complete deployment policy or deploy authorization.
 * Boundary must be independently provisioned/reviewed and immutable to this executor.
 * Exact runtime role name must match the final reviewed application template.
 */
export function deploymentIamGuardrails(account: string, runtimeRoleName: string, boundaryName: string) {
  if (!/^\d{12}$/.test(account) || !/^lcm-production-[a-z0-9-]{1,40}$/.test(runtimeRoleName) ||
    !/^lcm-production-[a-z0-9-]{1,40}$/.test(boundaryName)) {
    throw new Error('Explicit LCM account and bounded role/policy names required');
  }
  const role = `arn:aws:iam::${account}:role/${runtimeRoleName}`;
  const boundary = `arn:aws:iam::${account}:policy/${boundaryName}`;
  return { Version: '2012-10-17', Statement: [
    { Sid: 'CreateOnlyBoundedRuntime', Effect: 'Allow', Action: 'iam:CreateRole', Resource: role,
      Condition: { ArnEquals: { 'iam:PermissionsBoundary': boundary } } },
    { Sid: 'ManageOnlyRuntimeInlinePolicy', Effect: 'Allow',
      Action: ['iam:GetRole', 'iam:GetRolePolicy', 'iam:ListRolePolicies', 'iam:ListAttachedRolePolicies',
        'iam:PutRolePolicy', 'iam:DeleteRolePolicy', 'iam:TagRole', 'iam:UntagRole', 'iam:DeleteRole'], Resource: role },
    { Sid: 'PassOnlyRuntimeToLambda', Effect: 'Allow', Action: 'iam:PassRole', Resource: role,
      Condition: { StringEquals: { 'iam:PassedToService': 'lambda.amazonaws.com' } } },
    { Sid: 'NeverRemoveRuntimeBoundary', Effect: 'Deny',
      Action: ['iam:DeleteRolePermissionsBoundary', 'iam:PutRolePermissionsBoundary'], Resource: role },
    { Sid: 'NeverEditApprovedBoundary', Effect: 'Deny',
      Action: ['iam:CreatePolicy', 'iam:CreatePolicyVersion', 'iam:SetDefaultPolicyVersion',
        'iam:DeletePolicyVersion', 'iam:DeletePolicy', 'iam:TagPolicy', 'iam:UntagPolicy'], Resource: boundary }
  ] };
}
