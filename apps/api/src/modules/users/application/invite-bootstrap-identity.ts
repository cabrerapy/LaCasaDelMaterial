import type { CognitoUserInvitation } from './invite-cognito-user.js';

interface Reservation { operationId: string; userId: string; operatorArn: string; createdAt: string; }
interface BootstrapInvitationStore {
  inspectPending(operation: string, operator: string): Promise<{ reservation: Reservation; profile: { email: string } }>;
  reserveInvitation(reservation: Reservation, sub: string, now: string): Promise<void>;
}

// Candidate only: no automatic retries, activation or password handling.
export class InviteBootstrapIdentity {
  constructor(private readonly store: BootstrapInvitationStore, private readonly identities: CognitoUserInvitation,
    private readonly now: () => number = Date.now) {}
  async execute(operationId: string, operatorArn: string): Promise<{ userId: string; status: 'INACTIVE'; invitation: 'REQUESTED' }> {
    const pending = await this.store.inspectPending(operationId, operatorArn);
    const id = pending.reservation.userId;
    const identity = await this.identities.inspect(id);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.sub) ||
      !identity.passwordChangeRequired || identity.email.trim().toLowerCase() !== pending.profile.email.trim().toLowerCase()) {
      throw new Error('Bootstrap invitation identity requires reconciliation');
    }
    await this.store.reserveInvitation(pending.reservation, identity.sub, new Date(this.now()).toISOString());
    try {
      await this.identities.enable(id);
      await this.identities.resendInvitation(id);
    } catch (failure: unknown) {
      try { await this.identities.disable(id); }
      catch (compensation: unknown) { throw new AggregateError([failure, compensation], 'Bootstrap invitation requires reconciliation'); }
      throw new Error('Bootstrap invitation requires reconciliation', { cause: failure });
    }
    return { userId: id, status: 'INACTIVE', invitation: 'REQUESTED' };
  }
}
