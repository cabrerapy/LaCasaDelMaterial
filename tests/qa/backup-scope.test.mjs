import assert from 'node:assert/strict';
import test from 'node:test';
import { backupScope, validateRestorePrefix } from './backup-scope.mjs';

const id = '66b23e32-91c2-4092-840d-5bbe7c2220ef';
test('selects the actual source API port for each isolated QA family', () => {
  assert.equal(backupScope(undefined).apiPort, 3000);
  assert.equal(backupScope(`lcm-qa-${id}`).apiPort, 3003);
  assert.equal(backupScope(`lcm-qa-finance-${id}`).apiPort, 3001);
});
test('rejects operational, malformed and extended source prefixes', () => {
  for (const value of ['', 'lcm-local', `lcm-prod-${id}`, `lcm-restore-${id}`,
    `lcm-qa-${'-'.repeat(36)}`, `lcm-qa-finance-${id}-users`]) {
    assert.throws(() => backupScope(value));
  }
});
test('restore destination cannot target source or operational tables', () => {
  validateRestorePrefix(`lcm-restore-${id}`);
  for (const value of [undefined, '', `lcm-qa-${id}`, `lcm-qa-finance-${id}`, 'lcm-local']) {
    assert.throws(() => validateRestorePrefix(value));
  }
});
