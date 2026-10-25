import { executorReviewBundle, type ExecutorReviewTarget } from './executor-review-bundle.js';
import { deploymentAssetRead } from './deployment-asset-read.js';
import { deploymentEdgeCreation } from './deployment-edge-creation.js';
import { deploymentEdgeTaggedCreation } from './deployment-edge-tagged-creation.js';
import { deploymentEdgeFunction } from './deployment-edge-function.js';
import { deploymentEdgeDistributionTags } from './deployment-edge-distribution-tags.js';
import { deploymentEdgeInitialLifecycle } from './deployment-edge-initial-lifecycle.js';

/** Offline attachment inventory only. No SDK, apply switch or automatic renewal.
 * It preserves source documents; temporary grants never enter permanent parts.
 */
export function executorAttachmentPlan(target: ExecutorReviewTarget, assetHash: string,
  expiresAt: string, now = Date.now()) {
  const base = executorReviewBundle(target);
  const args = [target.account, target.region, target.executorRoleName, expiresAt, now] as const;
  const temporary = [
    ['edge-create', deploymentEdgeCreation(...args)],
    ['edge-tagged-create', deploymentEdgeTaggedCreation(...args)],
    ['edge-function', deploymentEdgeFunction(...args)],
    ['edge-distribution-tags', deploymentEdgeDistributionTags(...args)],
    ['edge-initial-lifecycle', deploymentEdgeInitialLifecycle(...args)]
  ] as const;
  const entries = [
    ...base.policies.map(part => ({ name: part.proposedName, temporary: false, document: part.document })),
    { name: 'lcm-production-executor-asset-read', temporary: false,
      document: deploymentAssetRead(target.account, target.region, target.executorRoleName, assetHash) },
    ...temporary.map(([name, document]) => ({ name: `lcm-production-executor-${name}`, temporary: true, document }))
  ];
  const seen = new Set<string>();
  const policies = entries.map(entry => {
    const characters = JSON.stringify(entry.document).length;
    if (characters > 6144) throw new Error('Proposed managed policy exceeds per-document limit');
    for (const statement of entry.document.Statement) {
      if (seen.has(statement.Sid)) throw new Error('Duplicate statement across attachment proposals');
      seen.add(statement.Sid);
    }
    return { ...entry, characters };
  });
  return { result: 'ATTACHMENT_PLAN_ONLY_NOT_APPLIED', readyToApply: false, target, expiresAt,
    policies, proposedManagedAttachments: policies.length,
    excluded: ['Executor trust (already created, verify separately)', 'Runtime boundary (independent ceiling)',
      'Publisher policies and removed delegation', 'Operator PassRole and CloudFormation stack actions'],
    blockers: ['Combined effective permission simulation, not only individual documents',
      'Live account policy/attachment quotas and current role state',
      'Fresh manifest/ZIP target and absence/ownership checks',
      'Handler/tagging dependencies and real recovery behavior',
      'Exact documents, hashes, fresh time window and explicit application approval',
      'Stack operation authority, costs/quotas and separate deployment approval'] };
}
