import { createHash } from 'node:crypto';
import { executorReviewBundle, type ExecutorReviewTarget } from './executor-review-bundle.js';
import { deploymentAssetRead } from './deployment-asset-read.js';

export function executorPermanentPackage(target: ExecutorReviewTarget, assetHash: string) {
  const base = executorReviewBundle(target);
  const sources = [...base.policies.map(p => ({name:p.proposedName,document:p.document})),
    {name:'lcm-production-executor-asset-read',document:deploymentAssetRead(target.account,target.region,target.executorRoleName,assetHash)}];
  return {result:'PERMANENT_PACKAGE_REVIEW_ONLY',readyToApply:false,target,assetHash,
    policies:sources.map(source => {
      const json = JSON.stringify(source.document);
      if (json.length > 6144) throw new Error('Policy exceeds per-document limit');
      return {name:source.name,filename:`${source.name}.json`,characters:json.length,
        sha256:createHash('sha256').update(json,'utf8').digest('hex'),json};
    }),
    limitations:['No AWS writes or deployment authorization',
      'Base configuration grants are privileged, not read-only',
      'No temporary edge grants, operator authority, trust, publisher or runtime boundary included',
      'Recheck identity, absence, trust, effective role policies, boundary and ZIP before application',
      'Stop on partial writes; no adoption, overwrite, deletion or automatic retry']};
}
