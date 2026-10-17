import { runtimeResourceNames } from '../lib/runtime-resource-names.js';
import { runtimeBoundaryPolicy } from '../lib/runtime-boundary-policy.js';
import { runtimeGuardrailConfig } from '../lib/runtime-guardrail-config.js';
import { deploymentIamGuardrails } from '../lib/deployment-iam-guardrails.js';
import { deploymentDataPermissions } from '../lib/deployment-data-permissions.js';
import { deploymentStoragePermissions } from '../lib/deployment-storage-permissions.js';
import { deploymentComputePermissions } from '../lib/deployment-compute-permissions.js';
import { deploymentIdentityPermissions } from '../lib/deployment-identity-permissions.js';
import { deploymentApiPermissions } from '../lib/deployment-api-permissions.js';

// Public, offline proposal only. No AWS imports, credentials or writes.
try {
  const [account, region, roleName, boundaryName, extra] = process.argv.slice(2);
  if (!account || !region || !roleName || !boundaryName || extra) throw new Error('Explicit public scope required');
  const names = runtimeResourceNames(account, region);
  const boundaryArn = `arn:aws:iam::${account}:policy/${boundaryName}`;
  const guardrail = runtimeGuardrailConfig(account, roleName, boundaryArn);
  console.log(JSON.stringify({ result: 'REVIEW_ONLY_NOT_APPLIED', names, guardrail,
    runtimeBoundary: runtimeBoundaryPolicy(names),
    executorIamPortionOnly: deploymentIamGuardrails(account, roleName, boundaryName),
    executorDataPortionOnly: deploymentDataPermissions(account, region),
    executorStoragePortionOnly: deploymentStoragePermissions(account, region),
    executorComputePortionOnly: deploymentComputePermissions(account, region),
    executorIdentityPortionOnly: deploymentIdentityPermissions(account, region),
    executorApiPortionOnly: deploymentApiPermissions(account, region),
    limitations: ['Names are proposed, not availability-checked or deployed',
      'Boundary must be independently reviewed/provisioned',
      'Data portion covers table configuration only; no deletion or complete rollback validation',
      'Storage portion covers bucket configuration only; policy contents, handlers and rollback need review',
      'Compute portion requires explicit function name; ZIP assets, handler dependencies and rollback need review',
      'Identity portion uses project tags, not a unique pool; tag-on-create authorization is unverified',
      'API portion requires actual handler tag context; tagging endpoints and rollback are unverified',
      'Executor service permissions, existing-role checks and approval still required'] }, null, 2));
} catch {
  console.error('Expected account, us-east-1, LCM runtime role name and LCM boundary name. No AWS changes made.');
  process.exitCode = 1;
}
