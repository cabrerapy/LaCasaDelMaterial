import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { API_LOGGER_OPTIONS } from '../app/create-app.js';
import { registerErrorHandler } from './error-handler.js';
import { matchesEvidenceContent } from '../modules/deliveries/application/evidence-content.js';

test('production logger options redact synthetic secrets and omit arbitrary error details', async () => {
  let captured = '';
  const stream = new Writable({ write(chunk: Buffer, _encoding, callback) {
    captured += chunk.toString(); callback();
  } });
  // Preserve synthetic headers here to exercise redaction even if serializers change.
  const app = Fastify({ logger: { ...API_LOGGER_OPTIONS, stream,
    serializers: {
      req: (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? { ...value } : {},
      res: (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? { ...value } : {}
    } } });
  registerErrorHandler(app);
  const marker = 'QA_SYNTHETIC_SECRET_NOT_A_REAL_CREDENTIAL';
  app.log.info({ password: marker, passwordHash: marker, accessToken: marker,
    refreshToken: marker, token: marker, secret: marker,
    payload: { password: marker, token: marker, secret: marker },
    req: { headers: { authorization: marker, cookie: marker } },
    res: { headers: { 'set-cookie': marker } } }, 'Synthetic redaction check');
  app.get('/qa-error', () => { throw new Error(marker); });
  try {
    const response = await app.inject('/qa-error');
    assert.equal(response.statusCode, 500);
    assert.equal(response.json<{ message: string }>().message, 'Internal server error');
    assert.ok(captured.includes('[REDACTED]'));
    assert.ok(captured.includes('Request failed'));
    assert.ok(!captured.includes(marker), 'Logs must not contain the synthetic secret');
  } finally { await app.close(); }
});

test('evidence signature check rejects disguised HTML, empty and truncated PNG', () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']) {
    assert.equal(matchesEvidenceContent(mime, Buffer.from('<html>not an image</html>')), false);
    assert.equal(matchesEvidenceContent(mime, Buffer.alloc(0)), false);
  }
  assert.equal(matchesEvidenceContent('image/png', Buffer.from([137, 80, 78, 71])), false);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  assert.equal(matchesEvidenceContent('image/png', png), true);
  assert.equal(matchesEvidenceContent('image/jpeg', png), false);
});
