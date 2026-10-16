import type { UserRepository } from '../domain/user.repository.js';

export interface BootstrapTarget {
  readonly accountId: string;
  readonly region: string;
  readonly poolId: string;
  readonly usersTable: string;
}
export interface BootstrapIdentity { readonly account: string; readonly arn: string; }

// Read-only gate. Caller must use the same authenticated SDK configuration for all reads/writes.
// Not a substitute for exclusive maintenance mode or transactional bootstrap reservation.
export async function bootstrapPreflight(target: BootstrapTarget,
  callerIdentity: () => Promise<BootstrapIdentity>, users: Pick<UserRepository, 'list'>): Promise<BootstrapIdentity> {
  if (!/^\d{12}$/.test(target.accountId) || !/^us-east-1$/.test(target.region) ||
    !/^us-east-1_[A-Za-z0-9]+$/.test(target.poolId) || !/^[A-Za-z0-9_.-]{3,255}$/.test(target.usersTable)) {
    throw new Error('Invalid bootstrap target');
  }
  const identity = await callerIdentity();
  if (identity.account !== target.accountId ||
    !new RegExp(`^arn:aws:iam::${target.accountId}:user/[A-Za-z0-9+=,.@_/-]+$`).test(identity.arn)) {
    throw new Error('Bootstrap requires a non-root IAM user in the target account');
  }
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const result = await users.list(100, cursor);
    if (result.items.some(user => user.role === 'ADMIN')) {
      throw new Error('Existing administrator: bootstrap requires reconciliation');
    }
    if (result.items.length !== 0) {
      throw new Error('Bootstrap requires an environment without existing user profiles');
    }
    if (!result.nextToken) return identity;
    if (cursors.has(result.nextToken)) throw new Error('Repeated bootstrap scan cursor');
    cursors.add(result.nextToken);
    cursor = result.nextToken;
  }
  throw new Error('Bootstrap scan limit exceeded; no reservation permitted');
}
