import {
  CreateTableCommand, DescribeTableCommand, type DynamoDBClient,
  ResourceNotFoundException, waitUntilTableExists, UpdateTableCommand
} from '@aws-sdk/client-dynamodb';
import { setTimeout as delay } from 'node:timers/promises';

export async function ensurePurchasesTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    const existing = await client.send(new DescribeTableCommand({ TableName: tableName }));
    // Upgrade LCM-007 tables non-destructively; never recreate an existing table.
    for (const [name, partition, sort] of [
      ['RelationIndex', 'relationId', 'relationSort'], ['ProductDateIndex', 'productId', 'receivedDateCreated']
    ] as const) {
      if (existing.Table?.GlobalSecondaryIndexes?.some((index) => index.IndexName === name)) continue;
      await client.send(new UpdateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [{ AttributeName: partition, AttributeType: 'S' }, { AttributeName: sort, AttributeType: 'S' }],
        GlobalSecondaryIndexUpdates: [{ Create: { IndexName: name,
          KeySchema: [{ AttributeName: partition, KeyType: 'HASH' }, { AttributeName: sort, KeyType: 'RANGE' }],
          Projection: { ProjectionType: 'ALL' }
        } }]
      }));
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const current = await client.send(new DescribeTableCommand({ TableName: tableName }));
        if (current.Table?.GlobalSecondaryIndexes?.some((index) => index.IndexName === name && index.IndexStatus === 'ACTIVE')) { ready = true; break; }
        await delay(1000);
      }
      if (!ready) throw new Error(`Índice ${name} todavía no está activo; vuelva a iniciar cuando termine`);
    }
    return;
  }
  catch (error: unknown) { if (!(error instanceof ResourceNotFoundException)) throw error; }
  await client.send(new CreateTableCommand({
    TableName: tableName, BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'entityType', AttributeType: 'S' },
      { AttributeName: 'purchaseDateCreated', AttributeType: 'S' }, { AttributeName: 'supplierId', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' }, { AttributeName: 'purchaseId', AttributeType: 'S' },
      { AttributeName: 'itemSort', AttributeType: 'S' }, { AttributeName: 'relationId', AttributeType: 'S' },
      { AttributeName: 'relationSort', AttributeType: 'S' }, { AttributeName: 'productId', AttributeType: 'S' },
      { AttributeName: 'receivedDateCreated', AttributeType: 'S' }
    ],
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'PurchaseDateIndex', KeySchema: [
          { AttributeName: 'entityType', KeyType: 'HASH' }, { AttributeName: 'purchaseDateCreated', KeyType: 'RANGE' }
        ], Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: 'SupplierDateIndex', KeySchema: [
          { AttributeName: 'supplierId', KeyType: 'HASH' }, { AttributeName: 'purchaseDateCreated', KeyType: 'RANGE' }
        ], Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: 'StatusDateIndex', KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' }, { AttributeName: 'purchaseDateCreated', KeyType: 'RANGE' }
        ], Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: 'PurchaseItemsIndex', KeySchema: [
          { AttributeName: 'purchaseId', KeyType: 'HASH' }, { AttributeName: 'itemSort', KeyType: 'RANGE' }
        ], Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: 'RelationIndex', KeySchema: [
          { AttributeName: 'relationId', KeyType: 'HASH' }, { AttributeName: 'relationSort', KeyType: 'RANGE' }
        ], Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: 'ProductDateIndex', KeySchema: [
          { AttributeName: 'productId', KeyType: 'HASH' }, { AttributeName: 'receivedDateCreated', KeyType: 'RANGE' }
        ], Projection: { ProjectionType: 'ALL' }
      }
    ]
  }));
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
}
