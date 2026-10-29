import { createHash } from 'node:crypto';
import { executionReviewPackage } from './execution-review-package.js';
import { deploymentInitialTagging } from './deployment-initial-tagging.js';
import { deploymentLogsCreationTagging } from './deployment-logs-creation-tagging.js';

/** Offline, separate approval package. No operator, data or S3 grant renewal. */
export function remainingAuthorityReview(account: string, region: string, stackId: string,
  expiresAt: string, now = Date.now()) {
  const base = executionReviewPackage(account, region, stackId, 'lcm-reviewed-remaining1', expiresAt, now);
  const api = deploymentInitialTagging(account, region, expiresAt, now).document;
  // Existing pool is already imported: do not renew broad pool creation tagging.
  const apiOnly = { Version: api.Version, Statement: api.Statement.filter(s => s.Action.includes('apigateway:POST')) };
  if (apiOnly.Statement.length !== 1) throw new Error('Exact API tagging statement required');
  const entries = [
    ...base.policies.filter(p => p.temporary).map(p => ({ name: `lcm-production-executor-${p.name}`,
      kind: 'existing-managed-default-version', document: p.document })),
    { name: 'lcm-production-executor-initial-tagging', kind: 'existing-managed-default-version', document: apiOnly },
    { name: 'lcm-production-logs-creation-tagging', kind: 'new-executor-inline',
      document: deploymentLogsCreationTagging(account, region, expiresAt, now).document }
  ];
  return { result: 'REMAINING_AUTHORITY_REVIEW_ONLY_NOT_APPLIED', readyToApply: false, awsCalls: false,
    stackArn: base.stackArn, changeSetName: base.changeSetName, expiresAt,
    principal: `arn:aws:iam::${account}:role/lcm-production-cfn-executor`,
    policies: entries.map(entry => ({ ...entry,
      sha256: createHash('sha256').update(JSON.stringify(entry.document)).digest('hex') })),
    risks: [
      'CloudFront creation lacks name/count isolation; lifecycle account/type wildcards can modify/delete unrelated resources',
      'Distribution/API request tags do not prove ownership and can retag existing resources during the window',
      'Initial-tagging update intentionally removes expired pool-creation tagging rather than renewing it',
      'Logs legacy tagging is documented but actual tagged creation remains unproven',
      'No operator execution authority, S3 read renewal, runtime-boundary change or deployment authorization',
      'Expiration does not delete attached policies or resources; no automatic renewal'
    ] };
}
