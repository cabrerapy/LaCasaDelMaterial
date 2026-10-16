interface PendingStore {
  inspectPending(operation: string, operator: string): Promise<{
    reservation: { userId: string }; profile: { email: string };
  }>;
}
interface IdentityReader {
  inspect(username: string): Promise<{ sub: string; email: string; confirmed: boolean;
    passwordChangeRequired: boolean; enabled: boolean; totpEnabled: boolean }>;
}

// Read-only gate; READY is not activation and does not prove fresh MFA on a commercial token.
export async function validateBootstrapFinalization(operationId: string, operatorArn: string,
  store: PendingStore, identities: IdentityReader,
  links: { findUserId(sub: string): Promise<string | null> }): Promise<{
    userId: string; sub: string; email: string; status: 'READY_NOT_ACTIVE';
  }> {
  const pending = await store.inspectPending(operationId, operatorArn);
  const identity = await identities.inspect(pending.reservation.userId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.sub) ||
    !identity.confirmed || identity.passwordChangeRequired || !identity.enabled || !identity.totpEnabled ||
    identity.email.trim().toLowerCase() !== pending.profile.email.trim().toLowerCase()) {
    throw new Error('Bootstrap identity not ready for finalization');
  }
  if (await links.findUserId(identity.sub) !== pending.reservation.userId) throw new Error('Bootstrap identity binding not verified');
  // Revalidate pending state after remote reads. Commit must still have its own conditions.
  const current = await store.inspectPending(operationId, operatorArn);
  if (current.reservation.userId !== pending.reservation.userId || current.profile.email !== pending.profile.email) {
    throw new Error('Bootstrap profile changed');
  }
  return { userId: pending.reservation.userId, sub: identity.sub, email: pending.profile.email, status: 'READY_NOT_ACTIVE' };
}
