import { deploymentEdgeCreation } from './deployment-edge-creation.js';

/** Separate temporary proposal for the two authorization paths observed in the failed create.
 * Request tags do not prove ownership: this can retag existing pools/APIs in the window.
 * Never merge silently into previously approved permanent documents.
 */
export function deploymentInitialTagging(account: string, region: string, expiresAt: string, now = Date.now()) {
  const window = deploymentEdgeCreation(account, region, 'lcm-production-cfn-executor', expiresAt, now)
    .Statement[0]!.Condition;
  const condition = { ...window, Bool: { 'aws:SecureTransport': 'true' },
    StringEquals: { ...window.StringEquals, 'aws:RequestedRegion': region,
      'aws:RequestTag/Project': 'LaCasaDelMaterial', 'aws:RequestTag/Environment': 'production' } };
  return { result: 'INITIAL_TAGGING_REVIEW_ONLY_NOT_APPLIED', readyToApply: false,
    document: { Version: '2012-10-17', Statement: [
      { Sid: 'TemporaryPoolCreationTagAuthorization', Effect: 'Allow', Action: ['cognito-idp:TagResource'],
        Resource: [`arn:aws:cognito-idp:${region}:${account}:userpool/*`], Condition: structuredClone(condition) },
      { Sid: 'TemporaryHttpV2CreationTagEndpoint', Effect: 'Allow', Action: ['apigateway:POST'],
        Resource: [`arn:aws:apigateway:${region}::/tags/arn%3Aaws%3Aapigateway%3A${region}%3A%3A%2Fv2%2Fapis%2F*`],
        Condition: structuredClone(condition) }
    ] },
    risks: [
      'Can retag existing pools and HTTP V2 APIs in this region; request tags do not establish ownership',
      'No resource-name/count isolation; additional request tags are not restricted',
      'Encoded API ARN path matches observed failure only; no general /tags/* fallback',
      'No Untag, user administration, data access or stack recovery permission',
      'Validate exact generated document remotely and review actual handler context before retry',
      'Expiration does not remove policy or resources; no automatic renewal/application'
    ] };
}
