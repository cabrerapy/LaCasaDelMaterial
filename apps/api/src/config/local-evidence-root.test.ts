import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve, join } from 'node:path';
import { localEvidenceRoot } from './local-evidence-root.js';
import { LocalDeliveryEvidenceStorage } from '../modules/deliveries/infrastructure/local-delivery-evidence.storage.js';

test('local evidence default preserves the existing folder', () => {
  assert.equal(localEvidenceRoot({}), '.data/delivery-evidence');
});
test('explicit restored folder resolves independently of source storage', async () => {
  const root = localEvidenceRoot({ NODE_ENV: 'development', LOCAL_DELIVERY_EVIDENCE_ROOT: ' .data/qa-restored/files ' });
  assert.equal(root, resolve('.data/qa-restored/files'));
  const storage = new LocalDeliveryEvidenceStorage(root);
  assert.equal(await storage.resolve('deliveries/qa/test.png'), join(root, 'deliveries/qa/test.png'));
  await assert.rejects(storage.resolve('../../outside.png'));
});
test('invalid configured roots fail closed instead of falling back to originals', () => {
  for (const root of ['', '  ', 'bad\0path', 'https://example.invalid/files', 'file:///files']) {
    assert.throws(() => localEvidenceRoot({ LOCAL_DELIVERY_EVIDENCE_ROOT: root }));
  }
});
test('production refuses local storage override', () => {
  assert.throws(() => localEvidenceRoot({ NODE_ENV: 'production', LOCAL_DELIVERY_EVIDENCE_ROOT: '.data/restored' }));
});
