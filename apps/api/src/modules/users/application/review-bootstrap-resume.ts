import { reviewBootstrap } from './review-bootstrap.js';
import type { BootstrapIdentity, BootstrapTarget } from './bootstrap-preflight.js';
import type { BootstrapResourceReader } from './bootstrap-resource-check.js';
import type { UserRepository } from '../domain/user.repository.js';

export async function reviewBootstrapResume(target: BootstrapTarget, operationId: string,
  identity: () => Promise<BootstrapIdentity>, resources: BootstrapResourceReader,
  users: Pick<UserRepository, 'list'>,
  inspection: { inspectPending(operation: string, operator: string): Promise<{ reservation: { userId: string } }> }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) throw new Error('Invalid bootstrap operation');
  let operatorArn = '';
  let expectedUser: string | undefined;
  return reviewBootstrap(target, async () => {
    const operator = await identity(); operatorArn = operator.arn; return operator;
  }, resources, { async list(limit, cursor) {
    if (!expectedUser) expectedUser = (await inspection.inspectPending(operationId, operatorArn)).reservation.userId;
    const page = await users.list(limit, cursor);
    const own = page.items.find(user => user.id === expectedUser);
    if (own && (own.role !== 'ADMIN' || own.status !== 'INACTIVE' || own.passwordHash !== '!COGNITO_ONLY' || own.cognitoDeactivatedAt)) {
      throw new Error('Bootstrap profile changed during review');
    }
    return { ...page, items: page.items.filter(user => user.id !== expectedUser) };
  } });
}
