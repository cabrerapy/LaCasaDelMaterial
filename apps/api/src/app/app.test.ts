import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './create-app.js';
import { loadConfig } from '../config/environment.js';

test('GET /api/health returns service status', async () => {
  const app = await createApp(loadConfig({ NODE_ENV: 'test' }));
  const response = await app.inject({ method: 'GET', url: '/api/health' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: 'ok',
    service: 'la-casa-del-material-api',
    version: '0.1.0',
    environment: 'test'
  });

  await app.close();
});
