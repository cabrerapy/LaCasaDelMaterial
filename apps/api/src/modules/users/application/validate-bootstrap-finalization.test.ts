import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateBootstrapFinalization } from './validate-bootstrap-finalization.js';
const id = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const pending = { reservation: { userId: id }, profile: { email: 'offline@example.invalid' } };
const identity = { sub: id, email: pending.profile.email, confirmed: true, passwordChangeRequired: false, enabled: true, totpEnabled: true };
test('finalization validation requires confirmed enabled TOTP and exact binding without activation', async () => {
  let reads = 0;
  assert.deepEqual(await validateBootstrapFinalization(id, 'offline-operator', {
    inspectPending: async () => { reads++; return pending; }
  }, { inspect: async () => identity }, { findUserId: async () => id }), { userId: id, sub: id, email: pending.profile.email, status: 'READY_NOT_ACTIVE' });
  assert.equal(reads, 2);
});
test('finalization rejects missing TOTP pending passwords disabled identities wrong email and bindings', async () => {
  for (const change of [{ totpEnabled: false }, { confirmed: false }, { enabled: false },
    { passwordChangeRequired: true }, { email: 'foreign@example.invalid' }, { sub: 'invalid' }]) {
    await assert.rejects(validateBootstrapFinalization(id, 'offline-operator', { inspectPending: async () => pending },
      { inspect: async () => ({ ...identity, ...change }) }, { findUserId: async () => id }));
  }
  await assert.rejects(validateBootstrapFinalization(id, 'offline-operator', { inspectPending: async () => pending },
    { inspect: async () => identity }, { findUserId: async () => null }));
});
