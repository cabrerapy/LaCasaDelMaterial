import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { createLambdaHandler } from './lambda-handler.js';

const context: Context = {
  callbackWaitsForEmptyEventLoop: false, functionName: 'test', functionVersion: '$LATEST',
  invokedFunctionArn: 'test-only', memoryLimitInMB: '512', awsRequestId: 'test',
  logGroupName: 'test', logStreamName: 'test', getRemainingTimeInMillis: () => 15000,
  done: () => undefined, fail: () => undefined, succeed: () => undefined
};
function event(path: string, method = 'GET', body?: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: 'value=a%2Cb',
    headers: { host: 'test.invalid', 'content-type': 'application/json' },
    queryStringParameters: { value: 'a,b' },
    requestContext: {
      accountId: 'test', apiId: 'test', domainName: 'test.invalid', domainPrefix: 'test',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      requestId: 'test', routeKey: '$default', stage: '$default', time: 'test', timeEpoch: 0
    },
    isBase64Encoded: false, ...(body === undefined ? {} : { body })
  };
}

test('HTTP API adapter reuses app without socket and preserves query, body, status and binary responses', async () => {
  const app = Fastify({ logger: false });
  let builds = 0;
  app.get('/api/health', () => ({ status: 'ok' }));
  app.post('/echo', (request, reply) => reply.code(201).send({ query: request.query, body: request.body }));
  app.get('/private', (_request, reply) => reply.code(401).send({ error: 'Unauthorized' }));
  const binary = Buffer.from([0, 255, 127, 128]);
  app.get('/binary', (_request, reply) => reply.type('application/octet-stream').send(binary));
  const handler = createLambdaHandler(async () => { builds++; return app; });
  try {
    const results = await Promise.all([handler(event('/api/health'), context), handler(event('/private'), context)]);
    assert.equal(results[0]?.statusCode, 200);
    assert.equal(results[1]?.statusCode, 401);
    assert.equal(builds, 1);
    assert.equal(app.server.listening, false);
    const echoed = await handler(event('/echo', 'POST', JSON.stringify({ amount: 65000 })), context);
    assert.equal(echoed.statusCode, 201);
    assert.deepEqual(JSON.parse(echoed.body), { query: { value: 'a,b' }, body: { amount: 65000 } });
    const downloaded = await handler(event('/binary'), context);
    assert.equal(downloaded.isBase64Encoded, true);
    assert.deepEqual(Buffer.from(downloaded.body, 'base64'), binary);
    assert.equal((await handler(event('/missing'), context)).statusCode, 404);
  } finally { await app.close(); }
});

test('failed initialization is not repeated in the same container', async () => {
  let attempts = 0;
  const handler = createLambdaHandler(async () => { attempts++; throw new Error('Configuration missing'); });
  await assert.rejects(handler(event('/api/health'), context), /Configuration missing/);
  await assert.rejects(handler(event('/api/health'), context), /Configuration missing/);
  assert.equal(attempts, 1);
});
