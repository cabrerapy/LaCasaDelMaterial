import { DefaultStackSynthesizer } from 'aws-cdk-lib';
import { executorAuthorityPlan } from './executor-authority-plan.js';

/** Review assembly only: dedicated CFN executor, no bootstrap role assumptions.
 * Empty role strings deliberately disable DefaultStackSynthesizer's role defaults
 * in the pinned CDK version; regression tests inspect emitted manifests.
 * Asset destinations still use the bootstrap bucket, NOT a publishing grant.
 * CLI credentials would perform stack/asset operations; those are not authorized
 * by synthesis. Never run a publish/deploy workflow without separate approval.
 */
export function reviewSynthesizer(account: string, region: string) {
  const authority = executorAuthorityPlan(account, region);
  return new DefaultStackSynthesizer({
    cloudFormationExecutionRole: authority.roleArn,
    deployRoleArn: '', lookupRoleArn: '', useLookupRoleForStackOperations: false,
    fileAssetPublishingRoleArn: '', imageAssetPublishingRoleArn: ''
  });
}
