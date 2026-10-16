import type { BootstrapTarget } from './bootstrap-preflight.js';

export type BootstrapStep = 'profile' | 'identity' | 'invitation' | 'finalization';
export interface BootstrapStepContext {
  readonly target: BootstrapTarget;
  readonly operationId: string;
  readonly operatorArn: string;
}
export interface BootstrapStepDependencies {
  /** Must verify effective external maintenance controls, not a caller-provided boolean. */
  assertExclusive(context: BootstrapStepContext): Promise<void>;
  /** Revalidate resources, identity and stage-specific persisted state. Never write. */
  review(step: BootstrapStep, context: BootstrapStepContext): Promise<void>;
  execute(step: BootstrapStep, context: BootstrapStepContext): Promise<void>;
}

/** Candidate only: no default exclusivity provider and no AWS/CLI wiring.
 * Pre/post checks do not themselves fence concurrent writers during a remote operation.
 * External exclusion must hold throughout; failure never triggers automatic retries.
 */
export async function runBootstrapStep(step: BootstrapStep, input: BootstrapStepContext,
  dependencies: BootstrapStepDependencies): Promise<{ step: BootstrapStep; result: 'STEP_COMPLETED' }> {
  const { target, operationId, operatorArn } = input;
  if (!['profile', 'identity', 'invitation', 'finalization'].includes(step) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId) ||
    !/^\d{12}$/.test(target.accountId) || target.region !== 'us-east-1' ||
    !/^us-east-1_[A-Za-z0-9]+$/.test(target.poolId) || !/^[A-Za-z0-9_.-]{3,255}$/.test(target.usersTable) ||
    !new RegExp(`^arn:aws:iam::${target.accountId}:user/[A-Za-z0-9+=,.@_/-]+$`).test(operatorArn)) {
    throw new Error('Invalid bootstrap step context');
  }
  // Copy/freeze public scope so a dependency cannot change the reviewed destination.
  const context = Object.freeze({ target: Object.freeze({ ...target }), operationId, operatorArn });
  await dependencies.assertExclusive(context);
  await dependencies.review(step, context);
  await dependencies.assertExclusive(context);
  try {
    await dependencies.execute(step, context);
    await dependencies.assertExclusive(context);
  } catch (cause: unknown) {
    // The stage owns compensation. Never repeat or invent a generic rollback here.
    throw new Error('Bootstrap step requires reconciliation; do not automatically retry', { cause });
  }
  return { step, result: 'STEP_COMPLETED' };
}
