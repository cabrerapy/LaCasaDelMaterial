import type { CognitoUserProvisioning } from './stage-cognito-user.js';

interface PendingInspection {
  inspectPending(operation: string, operator: string): Promise<{
    reservation: { userId: string }; profile: { name: string; username: string; email: string };
  }>;
}

// Candidate first-attempt provisioning only; never automatically adopts an existing identity.
export class StageBootstrapIdentity {
  constructor(private readonly pending: PendingInspection, private readonly identities: CognitoUserProvisioning,
    private readonly links: { link(userId: string, sub: string): Promise<void> }) {}
  async execute(operationId: string, operatorArn: string): Promise<{ userId: string; status: 'INACTIVE' }> {
    const initial = await this.pending.inspectPending(operationId, operatorArn);
    const id = initial.reservation.userId;
    try {
      const sub = await this.identities.createSuppressed(id, initial.profile.email, initial.profile.name);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) throw new Error('Invalid bootstrap identity');
      await this.identities.disable(id);
      const current = await this.pending.inspectPending(operationId, operatorArn);
      if (current.reservation.userId !== id || current.profile.email !== initial.profile.email ||
        current.profile.name !== initial.profile.name || current.profile.username !== initial.profile.username) {
        throw new Error('Bootstrap profile changed');
      }
      await this.links.link(id, sub);
    } catch (failure: unknown) {
      try { await this.identities.disable(id); }
      catch (compensation: unknown) { throw new AggregateError([failure, compensation], 'Bootstrap identity requires reconciliation'); }
      throw new Error('Bootstrap identity requires reconciliation', { cause: failure });
    }
    return { userId: id, status: 'INACTIVE' };
  }
}
