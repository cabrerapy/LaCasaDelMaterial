import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ensurePurchasesTable } from '../../infrastructure/dynamodb/purchases-table.js';
import { DynamoDbPurchaseRepository } from './infrastructure/dynamodb-purchase.repository.js';
import { DynamoDbReceivingRepository } from '../receiving/infrastructure/dynamodb-receiving.repository.js';
import { DynamoDbInventoryRepository } from '../inventory/infrastructure/dynamodb-inventory.repository.js';

test('real DynamoDB: purchase listing accepts absent and optional date filters', async () => {
  assert.equal(process.env['DYNAMODB_TEST_ENDPOINT'], 'http://localhost:8000');
  const client = new DynamoDBClient({ endpoint: 'http://localhost:8000', region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const tableName = `lcm-test-purchases-${randomUUID()}`;
  await ensurePurchasesTable(client, tableName);
  try {
    const repository = new DynamoDbPurchaseRepository(DynamoDBDocumentClient.from(client), tableName);
    const receiving = new DynamoDbReceivingRepository(DynamoDBDocumentClient.from(client), tableName, new DynamoDbInventoryRepository(DynamoDBDocumentClient.from(client), 'unused-qa-inventory'));
    for (const filter of [{}, { productId: randomUUID() }, { supplierId: randomUUID() }, { receiptId: randomUUID() }, { purchaseId: randomUUID() }, { dateFrom: '2026-10-01' }]) {
      assert.deepEqual((await receiving.listLots({ limit: 25, ...filter })).items, []);
    }
    for (const filter of [{}, { supplierId: randomUUID() }, { status: 'DRAFT' as const }, { purchaseId: randomUUID() }, { dateTo: '2026-10-04' }]) {
      assert.deepEqual((await receiving.listReceipts({ limit: 25, ...filter })).items, []);
    }
    for (const filter of [{}, { status: 'DRAFT' as const }, { supplierId: randomUUID() }, { dateFrom: '2026-10-01' }, { dateTo: '2026-10-04' }]) {
      assert.deepEqual((await repository.list({ limit: 25, ...filter })).items, []);
    }
  } finally {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
    client.destroy();
  }
});
