import { runtimeResourceNames } from './runtime-resource-names.js';
import { deploymentIamGuardrails } from './deployment-iam-guardrails.js';
import { deploymentDataPermissions } from './deployment-data-permissions.js';
import { deploymentStoragePermissions } from './deployment-storage-permissions.js';
import { deploymentComputePermissions } from './deployment-compute-permissions.js';
import { deploymentIdentityPermissions } from './deployment-identity-permissions.js';
import { deploymentApiPermissions } from './deployment-api-permissions.js';

interface Statement {
  Sid: string;
  Effect: string;
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, Record<string, string | undefined> | undefined>;
}
interface PolicyDocument { Version: string; Statement: Statement[] }
export interface ExecutorReviewTarget {
  readonly account: string;
  readonly region: string;
  readonly runtimeRoleName: string;
  readonly boundaryName: string;
  readonly executorRoleName: string;
}

/** Offline, incomplete review artifact, never a deployment authorization.
 * Partition at statement boundaries; preserve every condition and explicit deny.
 * Runtime permissions, temporary creation and post-creation edge IDs stay separate.
 */
export function executorReviewBundle(target: ExecutorReviewTarget) {
  runtimeResourceNames(target.account, target.region);
  if (!/^lcm-production-[a-z0-9-]{1,40}$/.test(target.executorRoleName) ||
    target.executorRoleName === target.runtimeRoleName) throw new Error('Distinct explicit executor role required');
  const sources: Record<string, PolicyDocument> = {
    iam: deploymentIamGuardrails(target.account, target.runtimeRoleName, target.boundaryName),
    data: deploymentDataPermissions(target.account, target.region),
    storage: deploymentStoragePermissions(target.account, target.region),
    compute: deploymentComputePermissions(target.account, target.region),
    identity: deploymentIdentityPermissions(target.account, target.region),
    api: deploymentApiPermissions(target.account, target.region)
  };
  const documents: PolicyDocument[] = [];
  let current: PolicyDocument = { Version: '2012-10-17', Statement: [] };
  const seen = new Set<string>();
  for (const source of Object.values(sources)) {
    for (const original of source.Statement) {
      if (seen.has(original.Sid)) throw new Error('Duplicate statement identity');
      seen.add(original.Sid);
      const statement = structuredClone(original);
      const alone = { Version: '2012-10-17', Statement: [statement] };
      if (JSON.stringify(alone).length > 6144) throw new Error('Statement exceeds managed policy quota');
      const candidate = { Version: '2012-10-17', Statement: [...current.Statement, statement] };
      if (JSON.stringify(candidate).length > 6144) {
        documents.push(current);
        current = alone;
      } else current = candidate;
    }
  }
  if (current.Statement.length) documents.push(current);
  return {
    result: 'INCOMPLETE_REVIEW_ONLY_NOT_APPLIED', readyForDeployment: false, target,
    sources: Object.keys(sources),
    policies: documents.map((document, index) => ({ proposedName: `lcm-production-executor-base-${index + 1}`,
      characters: JSON.stringify(document).length, document })),
    excluded: ['Runtime boundary and application data-plane grants',
      'Temporary edge/edgeTagged creation grants', 'Edge maintenance without verified real IDs',
      'Operator assume-role, asset publishing and bootstrap policy provisioning'],
    blockers: ['Exact ZIP asset read permissions and publication separation',
      'CloudFormation tag-on-create and handler dependencies',
      'Initial edge lifecycle reads/publication/rollback with IDs not yet known',
      'Independent runtime boundary and executor trust/effective policy review',
      'Combined remote policy validation/simulation and account attachment quotas',
      'Cost, secure first-admin bootstrap, production smoke and explicit application approval']
  };
}
