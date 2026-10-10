import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadConfig } from '../config/environment.js';
import { createDynamoDbRepositories } from './dynamodb-repositories.js';
import { createApp } from './create-app.js';
import { Argon2PasswordHasher } from '../modules/auth/infrastructure/argon2-password-hasher.js';
import { LocalJwtAuthentication } from '../modules/auth/infrastructure/local-jwt-authentication.js';
import { LocalDeliveryEvidenceStorage } from '../modules/deliveries/infrastructure/local-delivery-evidence.storage.js';

test('API composition needs no network, provisioning, bootstrap or listening socket', async () => {
  const config = loadConfig({ NODE_ENV: 'test', INITIAL_ADMIN_PASSWORD: 'test-only-password', JWT_SECRET: 'test-only-secret-with-at-least-32-characters' });
  let requests = 0;
  const client = new DynamoDBClient({
    region: 'us-east-1', credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    requestHandler: { handle: async () => { requests++; throw new Error('Network forbidden in composition test'); } }
  });
  const repositories = createDynamoDbRepositories(config, DynamoDBDocumentClient.from(client));
  assert.equal(Object.keys(repositories).length, 17);
  const app = await createApp(config, {
    ...repositories, passwordHasher: new Argon2PasswordHasher(),
    authentication: new LocalJwtAuthentication(config.jwtSecret, config.jwtExpiresIn),
    deliveryEvidenceStorage: new LocalDeliveryEvidenceStorage('.data/test-composition')
  });
  try {
    await app.ready();
    assert.equal(app.server.listening, false);
    assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/users' })).statusCode, 401);
    assert.equal(requests, 0);
  } finally {
    await app.close();
    client.destroy();
  }
});
