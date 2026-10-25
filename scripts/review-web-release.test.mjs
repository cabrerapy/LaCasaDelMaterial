import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewWebRelease } from './review-web-release.mjs';

test('offline inventory excludes local runtime config, hashes assets and never approves upload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lcm-web-review-'));
  try {
    await writeFile(join(root, 'index.html'), '<html></html>');
    await writeFile(join(root, 'main-abc.js'), 'export {};');
    await writeFile(join(root, 'runtime-config.json'), '{"authMode":"local"}');
    const result = await reviewWebRelease(root);
    assert.equal(result.awsCalls, false);
    assert.equal(result.readyForPublication, false);
    assert.deepEqual(result.excluded, ['runtime-config.json']);
    assert.equal(result.files.length, 2);
    assert.match(result.files[0].sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.files[0].cacheControl, 'no-store, max-age=0');
    await writeFile(join(root, 'main.js.map'), '{}');
    await assert.rejects(reviewWebRelease(root), /Unexpected release input/);
  } finally { await rm(root, { recursive: true }); }
});

test('missing entrypoint fails closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lcm-web-review-'));
  try { await assert.rejects(reviewWebRelease(root), /Missing browser/); }
  finally { await rm(root, { recursive: true }); }
});
