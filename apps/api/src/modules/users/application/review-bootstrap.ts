import { bootstrapPreflight, type BootstrapIdentity, type BootstrapTarget } from './bootstrap-preflight.js';
import { checkBootstrapResources, type BootstrapResourceReader } from './bootstrap-resource-check.js';
import type { UserRepository } from '../domain/user.repository.js';

// Read-only orchestration. REVIEWED is not permission to create or activate anything.
export async function reviewBootstrap(target: BootstrapTarget, identity: () => Promise<BootstrapIdentity>,
  resources: BootstrapResourceReader, users: Pick<UserRepository, 'list'>): Promise<{
    status: 'REVIEWED_NOT_BOOTSTRAPPED'; operatorArn: string; accountId: string; region: string;
  }> {
  let verifiedResources = false;
  const operator = await bootstrapPreflight(target, identity, {
    async list(limit, cursor) {
      if (!verifiedResources) {
        await checkBootstrapResources(target, resources);
        verifiedResources = true;
      }
      return users.list(limit, cursor);
    }
  });
  return { status: 'REVIEWED_NOT_BOOTSTRAPPED', operatorArn: operator.arn,
    accountId: operator.account, region: target.region };
}
