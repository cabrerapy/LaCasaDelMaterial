import { validateBootstrapFinalization } from './validate-bootstrap-finalization.js';
interface Reservation { operationId: string; userId: string; operatorArn: string; createdAt: string; }
interface FinalizationStore {
  resume(operation: string, operator: string): Promise<Reservation>;
  inspectPending(operation: string, operator: string): Promise<{ reservation: Reservation; profile: { email: string } }>;
  finalize(reservation: Reservation, sub: string, email: string, now: string): Promise<void>;
  blockAfterFinalizationFailure(reservation: Reservation, now: string): Promise<void>;
}
interface Identity {
  inspect(username: string): Promise<{ sub: string; email: string; confirmed: boolean;
    passwordChangeRequired: boolean; enabled: boolean; totpEnabled: boolean }>;
  disable(username: string): Promise<void>;
}

// Candidate orchestrator, not exposed by HTTP or a mutation CLI.
export class FinalizeBootstrap {
  constructor(private readonly store: FinalizationStore, private readonly identities: Identity,
    private readonly links: { findUserId(sub: string): Promise<string | null> },
    private readonly now: () => number = Date.now) {}
  async execute(operationId: string, operatorArn: string): Promise<{ userId: string; status: 'ACTIVE' }> {
    const reservation = await this.store.resume(operationId, operatorArn);
    const validated = await validateBootstrapFinalization(operationId, operatorArn, this.store, this.identities, this.links);
    const pending = await this.store.inspectPending(operationId, operatorArn);
    if (reservation.userId !== validated.userId || pending.reservation.userId !== validated.userId || pending.profile.email !== validated.email) {
      throw new Error('Bootstrap reservation changed');
    }
    const timestamp = new Date(this.now()).toISOString();
    try {
      await this.store.finalize(reservation, validated.sub, pending.profile.email, timestamp);
    } catch (failure: unknown) {
      const failures: unknown[] = [failure];
      try { await this.store.blockAfterFinalizationFailure(reservation, timestamp); }
      catch (compensation: unknown) { failures.push(compensation); }
      try { await this.identities.disable(reservation.userId); }
      catch (compensation: unknown) { failures.push(compensation); }
      throw new AggregateError(failures, 'Bootstrap finalization requires reconciliation');
    }
    return { userId: validated.userId, status: 'ACTIVE' };
  }
}
