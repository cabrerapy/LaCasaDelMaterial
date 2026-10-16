import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FinalizeBootstrap } from './finalize-bootstrap.js';
const id = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const reservation = { operationId: id, userId: id, operatorArn: 'offline-operator', createdAt: '2026-10-12T00:00:00.000Z' };
const email = 'offline@example.invalid';
const identity = { sub: id, email, confirmed: true, enabled: true, passwordChangeRequired: false, totpEnabled: true };
test('finalization reports ACTIVE only after validated conditional commit succeeds', async () => {
  const calls: string[] = [];
  const service = new FinalizeBootstrap({ resume: async () => reservation,
    inspectPending: async () => ({ reservation, profile: { email } }),
    finalize: async (_reservation, sub, expectedEmail) => { assert.equal(sub, id); assert.equal(expectedEmail, email); calls.push('commit'); },
    blockAfterFinalizationFailure: async () => { calls.push('block'); }
  }, { inspect: async () => identity, disable: async () => { calls.push('disable'); } }, { findUserId: async () => id });
  assert.deepEqual(await service.execute(id, reservation.operatorArn), { userId: id, status: 'ACTIVE' });
  assert.deepEqual(calls, ['commit']);
});
test('ambiguous commit attempts both compensations even when internal blocking fails', async () => {
  const calls: string[] = [];
  const service = new FinalizeBootstrap({ resume: async () => reservation,
    inspectPending: async () => ({ reservation, profile: { email } }),
    finalize: async () => { calls.push('commit'); throw new Error('timeout'); },
    blockAfterFinalizationFailure: async () => { calls.push('block'); throw new Error('Dynamo unavailable'); }
  }, { inspect: async () => identity, disable: async () => { calls.push('disable'); throw new Error('Cognito unavailable'); } },
  { findUserId: async () => id });
  await assert.rejects(service.execute(id, reservation.operatorArn), error => error instanceof AggregateError && error.errors.length === 3);
  assert.deepEqual(calls, ['commit', 'block', 'disable']);
});

test('failed MFA gate and changed email prevent commit and all compensation writes', async () => {
  for (const failure of ['totp', 'email']) {
    let reads = 0;
    const writes: string[] = [];
    const service = new FinalizeBootstrap({ resume: async () => reservation,
      inspectPending: async () => ({ reservation, profile: { email: ++reads === 3 && failure === 'email' ? 'changed@example.invalid' : email } }),
      finalize: async () => { writes.push('commit'); }, blockAfterFinalizationFailure: async () => { writes.push('block'); }
    }, { inspect: async () => ({ ...identity, totpEnabled: failure !== 'totp' }),
      disable: async () => { writes.push('disable'); } }, { findUserId: async () => id });
    await assert.rejects(service.execute(id, reservation.operatorArn));
    assert.deepEqual(writes, []);
  }
});

test('successful compensations still require reconciliation after a failed commit', async () => {
  const calls: string[] = [];
  const service = new FinalizeBootstrap({ resume: async () => reservation,
    inspectPending: async () => ({ reservation, profile: { email } }),
    finalize: async () => { throw new Error('timeout'); },
    blockAfterFinalizationFailure: async () => { calls.push('block'); }
  }, { inspect: async () => identity, disable: async () => { calls.push('disable'); } }, { findUserId: async () => id });
  await assert.rejects(service.execute(id, reservation.operatorArn), error => error instanceof AggregateError && error.errors.length === 1);
  assert.deepEqual(calls, ['block', 'disable']);
});
