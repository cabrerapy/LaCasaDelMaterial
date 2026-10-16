import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBootstrapStep, type BootstrapStepContext } from './run-bootstrap-step.js';

const context: BootstrapStepContext = {
  target: { accountId: '123456789012', region: 'us-east-1', poolId: 'us-east-1_Offline', usersTable: 'offline-users' },
  operationId: 'a2e086e2-47fd-4a56-90fd-3f9b772b0230', operatorArn: 'arn:aws:iam::123456789012:user/offline'
};
test('executes only the requested stage, with exclusion checks around review and execution', async () => {
  const calls: string[] = [];
  const result = await runBootstrapStep('identity', context, {
    assertExclusive: async c => { assert.ok(Object.isFrozen(c.target)); calls.push('exclusive'); },
    review: async (step, c) => { assert.equal(c.operationId, context.operationId); calls.push(`review:${step}`); },
    execute: async step => { calls.push(`execute:${step}`); }
  });
  assert.deepEqual(calls, ['exclusive', 'review:identity', 'exclusive', 'execute:identity', 'exclusive']);
  assert.deepEqual(result, { step: 'identity', result: 'STEP_COMPLETED' });
});
test('failed initial or second exclusion check prevents all mutations', async () => {
  for (const failAt of [1, 2]) {
    let checks = 0; let writes = 0;
    await assert.rejects(runBootstrapStep('profile', context, {
      assertExclusive: async () => { if (++checks === failAt) throw new Error('Not exclusive'); },
      review: async () => {}, execute: async () => { writes++; }
    }));
    assert.equal(writes, 0);
  }
});
test('failed review prevents execution', async () => {
  await assert.rejects(runBootstrapStep('invitation', context, {
    assertExclusive: async () => {}, review: async () => { throw new Error('State changed'); },
    execute: async () => { assert.fail('Unexpected mutation'); }
  }));
});
test('ambiguous stage failure and post-check loss require reconciliation without retry', async () => {
  for (const executionFails of [true, false]) {
    let checks = 0; let writes = 0;
    await assert.rejects(runBootstrapStep('finalization', context, {
      assertExclusive: async () => { if (++checks === 3) throw new Error('Lost exclusion'); },
      review: async () => {}, execute: async () => { writes++; if (executionFails) throw new Error('Timeout'); }
    }), /requires reconciliation/);
    assert.equal(writes, 1);
  }
});
test('root or foreign operator and malformed scope fail before dependencies', async () => {
  for (const input of [{ ...context, operatorArn: 'arn:aws:iam::123456789012:root' },
    { ...context, operatorArn: 'arn:aws:iam::999999999999:user/other' },
    { ...context, operationId: 'invalid' }, { ...context, target: { ...context.target, region: 'us-east-2' } }]) {
    const never = async () => { assert.fail('Unexpected dependency call'); };
    await assert.rejects(runBootstrapStep('identity', input, { assertExclusive: never, review: never, execute: never }));
  }
});
