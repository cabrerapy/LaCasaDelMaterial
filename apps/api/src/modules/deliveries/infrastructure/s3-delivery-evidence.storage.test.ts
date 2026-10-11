import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S3DeliveryEvidenceStorage } from './s3-delivery-evidence.storage.js';
import type { PutObjectCommand } from '@aws-sdk/client-s3';
const id = '12345678-1234-1234-1234-123456789012';
const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
test('writes immutable private evidence with server-generated key and owner protection', async () => {
  const calls: PutObjectCommand[] = [];
  const storage = new S3DeliveryEvidenceStorage('offline-evidence', '123456789012', {
    async send(command) { calls.push(command); return { $metadata: {} }; }
  }, async () => 'https://offline.invalid/file');
  const saved = await storage.save(id, 'pdf', pdf);
  assert.ok(saved.storageKey.startsWith(`deliveries/${id}/`));
  assert.equal('absolutePath' in saved, false);
  assert.equal(calls[0]!.input.ExpectedBucketOwner, '123456789012');
  assert.equal(calls[0]!.input.IfNoneMatch, '*');
  assert.equal(calls[0]!.input.ACL, undefined);
  assert.equal(calls[0]!.input.ServerSideEncryption, 'AES256');
});
test('rejects traversal, unsupported content and oversized evidence before S3', async () => {
  let calls = 0;
  const storage = new S3DeliveryEvidenceStorage('offline-evidence', '123456789012', {
    async send() { calls++; return { $metadata: {} }; }
  }, async () => { calls++; return 'https://offline.invalid/file'; });
  await assert.rejects(storage.save('../escape', 'pdf', pdf));
  await assert.rejects(storage.save(id, 'html', pdf));
  await assert.rejects(storage.save(id, 'pdf', Buffer.from('<html>')));
  await assert.rejects(storage.save(id, 'pdf', Buffer.alloc(5 * 1024 * 1024 + 1)));
  await assert.rejects(storage.signedRead('deliveries/../../secret.pdf'));
  assert.equal(calls, 0);
});
test('read signing expires after 60 seconds and upload failures never return metadata', async () => {
  const storage = new S3DeliveryEvidenceStorage('offline-evidence', '123456789012', {
    async send() { throw new Error('S3 failure'); }
  }, async (command, expiry) => {
    assert.equal(expiry, 60);
    assert.equal(command.input.ExpectedBucketOwner, '123456789012');
    assert.equal(command.input.ResponseContentDisposition, 'attachment');
    return 'https://offline.invalid/file?signature=offline';
  });
  assert.ok((await storage.signedRead(`deliveries/${id}/${id}.pdf`)).startsWith('https:'));
  await assert.rejects(storage.save(id, 'pdf', pdf), /S3 failure/);
});
