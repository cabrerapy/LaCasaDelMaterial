import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StageBootstrapIdentity } from './stage-bootstrap-identity.js';
const id = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const sub = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
const pending = { reservation: { userId: id }, profile: { name: 'Offline', username: 'offline', email: 'offline@example.invalid' } };
test('bootstrap identity stages suppress disable recheck and link without invitation or activation', async () => {
  const calls: string[] = [];
  const service = new StageBootstrapIdentity({ inspectPending: async () => { calls.push('inspect'); return pending; } }, {
    createSuppressed: async username => { assert.equal(username, id); calls.push('create'); return sub; },
    disable: async () => { calls.push('disable'); }
  }, { link: async (user, subject) => { assert.equal(user, id); assert.equal(subject, sub); calls.push('link'); } });
  assert.deepEqual(await service.execute(id, 'offline-operator'), { userId: id, status: 'INACTIVE' });
  assert.deepEqual(calls, ['inspect', 'create', 'disable', 'inspect', 'link']);
});
test('ambiguous create and failed binding compensate with disable and never report staged', async () => {
  for (const failCreate of [true, false]) {
    let disabled = 0;
    const service = new StageBootstrapIdentity({ inspectPending: async () => pending }, {
      createSuppressed: async () => { if (failCreate) throw new Error('timeout'); return sub; },
      disable: async () => { disabled++; }
    }, { link: async () => { throw new Error('binding failed'); } });
    await assert.rejects(service.execute(id, 'offline-operator'), /reconciliation/);
    assert.equal(disabled, failCreate ? 1 : 2);
  }
});
