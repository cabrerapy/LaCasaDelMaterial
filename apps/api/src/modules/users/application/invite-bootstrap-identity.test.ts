import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InviteBootstrapIdentity } from './invite-bootstrap-identity.js';
const id = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const reservation = { operationId: id, userId: id, operatorArn: 'offline-operator', createdAt: '2026-10-12T00:00:00.000Z' };
test('bootstrap invitation reserves before enable and email without internal activation', async () => {
  const calls: string[] = [];
  const service = new InviteBootstrapIdentity({
    inspectPending: async () => ({ reservation, profile: { email: 'offline@example.invalid' } }),
    reserveInvitation: async (_reservation, _sub, now) => { assert.equal(now, reservation.createdAt); calls.push('reserve'); }
  }, { inspect: async () => ({ sub: id, email: 'offline@example.invalid', passwordChangeRequired: true }),
    enable: async () => { calls.push('enable'); }, resendInvitation: async () => { calls.push('email'); },
    disable: async () => { calls.push('disable'); }
  }, () => Date.parse(reservation.createdAt));
  assert.deepEqual(await service.execute(id, reservation.operatorArn), { userId: id, status: 'INACTIVE', invitation: 'REQUESTED' });
  assert.deepEqual(calls, ['reserve', 'enable', 'email']);
});
test('invalid identity or reservation failure prevents email; send failure compensates disable', async () => {
  for (const failure of ['identity', 'reserve', 'email']) {
    const calls: string[] = [];
    const service = new InviteBootstrapIdentity({
      inspectPending: async () => ({ reservation, profile: { email: 'offline@example.invalid' } }),
      reserveInvitation: async () => { if (failure === 'reserve') throw new Error('cooldown'); calls.push('reserve'); }
    }, { inspect: async () => ({ sub: id, email: failure === 'identity' ? 'wrong@example.invalid' : 'offline@example.invalid', passwordChangeRequired: true }),
      enable: async () => { calls.push('enable'); },
      resendInvitation: async () => { calls.push('email'); throw new Error('timeout'); },
      disable: async () => { calls.push('disable'); } });
    await assert.rejects(service.execute(id, reservation.operatorArn));
    assert.deepEqual(calls, failure === 'email' ? ['reserve', 'enable', 'email', 'disable'] : []);
  }
});
