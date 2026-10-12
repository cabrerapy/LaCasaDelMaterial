import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

function event(path: string, method = 'GET', body?: string): APIGatewayProxyEventV2 {
  return { version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: '',
    headers: { host: 'offline.invalid', 'content-type': 'application/json' },
    requestContext: { accountId: 'offline', apiId: 'offline', domainName: 'offline.invalid', domainPrefix: 'offline',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'offline', routeKey: '$default', stage: '$default', time: 'offline', timeEpoch: 0 },
    isBase64Encoded: false, ...(body === undefined ? {} : { body }) };
}

test('production entrypoint serves health without provisioning or local passwords', async () => {
  const original = { ...process.env };
  const clients = [mock.method(DynamoDBClient.prototype, 'send', () => { throw new Error('Unexpected AWS call'); }),
    mock.method(DynamoDBDocumentClient.prototype, 'send', () => { throw new Error('Unexpected AWS call'); }),
    mock.method(S3Client.prototype, 'send', () => { throw new Error('Unexpected AWS call'); })];
  try {
    for (const key of ['DYNAMODB_ENDPOINT', 'JWT_SECRET', 'INITIAL_ADMIN_PASSWORD', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_DYNAMODB']) delete process.env[key];
    Object.assign(process.env, { NODE_ENV: 'production', AUTH_MODE: 'cognito', AWS_REGION: 'us-east-1',
      COGNITO_USER_POOL_ID: 'us-east-1_Offline', COGNITO_CLIENT_ID: 'offlineclient', WEB_ORIGIN: 'https://offline.invalid',
      DELIVERY_EVIDENCE_BUCKET: 'offline-evidence-bucket', AWS_ACCOUNT_ID: '123456789012' });
    process.env['LCM_COGNITO_ADMIN_ENABLED'] = 'no';
    process.env['LCM_COGNITO_ENROLLMENT_ENABLED'] = 'no';
    for (const table of ['USERS','CATEGORIES','PRODUCTS','SUPPLIERS','PURCHASES','INVENTORY','CUSTOMERS','SALES','COSTING','CASH','TRUCKS','DRIVERS','TRIPS','TRIP_LOADS','FUEL','DELIVERIES']) {
      process.env[`DYNAMODB_${table}_TABLE`] = `offline-production-${table.toLowerCase()}`;
    }
    const { handler } = await import('./lambda.js');
    const context = { callbackWaitsForEmptyEventLoop: false } as Context;
    assert.equal((await handler(event('/api/health'), context)).statusCode, 200);
    assert.equal((await handler(event('/api/auth/login', 'POST', JSON.stringify({ username: 'admin', password: 'NeverUsed123!' })), context)).statusCode, 401);
    assert.equal((await handler(event('/api/users', 'POST', '{}'), context)).statusCode, 404);
    assert.equal((await handler(event('/api/users/cognito', 'POST', '{}'), context)).statusCode, 404);
    assert.equal((await handler(event('/api/auth/enrollment/totp/begin', 'POST', '{}'), context)).statusCode, 404);
    assert.equal((await handler(event('/api/users/00000000-0000-4000-8000-000000000001/status', 'PATCH', '{}'), context)).statusCode, 404);
    assert.equal((await handler(event('/api/users'), context)).statusCode, 401);
    assert.equal((await handler(event('/api/health'), context)).statusCode, 200);
    for (const client of clients) assert.equal(client.mock.callCount(), 0);
  } finally {
    mock.restoreAll();
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
