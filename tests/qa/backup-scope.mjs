import assert from 'node:assert/strict';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function backupScope(prefix) {
  if (prefix === undefined) return { apiPort: 3000 };
  assert.match(prefix, new RegExp(`^lcm-qa-(?:finance-)?${uuid}$`), 'Only isolated QA prefixes allowed');
  return { apiPort: prefix.startsWith('lcm-qa-finance-') ? 3001 : 3003 };
}

export function validateRestorePrefix(prefix) {
  assert.match(prefix ?? '', new RegExp(`^lcm-restore-${uuid}$`), 'Only isolated restore destinations allowed');
}
