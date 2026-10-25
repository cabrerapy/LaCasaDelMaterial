import { assetPublisherProposal } from './asset-publisher-proposal.js';

/** Root must independently create/review the boundary before any delegation.
 * No AWS SDK or apply path. Expiry limits delegation, not the created role.
 */
export function publisherDelegation(account: string, region: string, hash: string,
  kmsKeyArn: string, expiresAt: string, now = Date.now()) {
  const publisher = assetPublisherProposal(account, region, hash, kmsKeyArn);
  const expiry = Date.parse(expiresAt);
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(expiry) ||
    new Date(expiry).toISOString() !== expiresAt || expiry <= now || expiry - now > 3600000) {
    throw new Error('Canonical future UTC expiry within one hour required');
  }
  const boundaryArn = `arn:aws:iam::${account}:policy/lcm-production-asset-publisher-boundary`;
  const time = { DateGreaterThanEquals: { 'aws:CurrentTime': new Date(now).toISOString() },
    DateLessThan: { 'aws:CurrentTime': expiresAt },
    ArnEquals: { 'aws:PrincipalArn': publisher.operatorArn },
    Bool: { 'aws:SecureTransport': 'true' } };
  return {
    result: 'INCOMPLETE_DELEGATION_REVIEW_ONLY', readyToApply: false, boundaryArn,
    boundaryDocument: publisher.s3Policy,
    operatorPolicy: { Version: '2012-10-17', Statement: [
      { Sid: 'CreateOnlyBoundedPublisher', Effect: 'Allow', Action: ['iam:CreateRole'],
        Resource: [publisher.roleArn], Condition: { ...time,
          StringEquals: { 'iam:PermissionsBoundary': boundaryArn } } },
      { Sid: 'ConfigureOnlyBoundedPublisher', Effect: 'Allow',
        Action: ['iam:PutRolePolicy'], Resource: [publisher.roleArn], Condition: time },
      { Sid: 'DoNotRemoveOrReplacePublisherBoundary', Effect: 'Deny',
        Action: ['iam:DeleteRolePermissionsBoundary','iam:PutRolePermissionsBoundary'], Resource: [publisher.roleArn] },
      { Sid: 'DoNotEditIndependentPublisherBoundary', Effect: 'Deny',
        Action: ['iam:CreatePolicyVersion','iam:SetDefaultPolicyVersion','iam:DeletePolicyVersion','iam:DeletePolicy'],
        Resource: [boundaryArn] }
    ] },
    blockers: [
      'Root must independently review/create the exact boundary document and verify its default version',
      'Review and simulate documents remotely; do not attach unvalidated delegation',
      'Creation script requires independent boundary read-back; remote integration and review still pending',
      'CreateRole trust and PutRolePolicy contents are not constrained by these IAM actions; boundary is essential',
      'Review all existing operator/resource policies, including S3-mediated KMS key access; boundary is not a global deny',
      'No UpdateAssumeRolePolicy, AttachRolePolicy, boundary management, operator policy writes or general IAM grants',
      'Root must remove the temporary operator policy and verify removal; expiry does not delete it or revoke the role',
      'No role assumption, upload, production deployment or root access keys authorized by this proposal'
    ]
  };
}
