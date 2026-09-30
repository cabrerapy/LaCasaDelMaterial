import {
  CreateTableCommand, DescribeTableCommand, type DynamoDBClient,
  ResourceNotFoundException, waitUntilTableExists
} from '@aws-sdk/client-dynamodb';

export async function ensurePurchasesTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try { await client.send(new DescribeTableCommand({ TableName: tableName })); return; }
  catch (error: unknown) { if (!(error instanceof ResourceNotFoundException)) throw error; }
  await client.send(new CreateTableCommand({
    TableName: tableName, BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'entityType', AttributeType: 'S' },
      { AttributeName: 'purchaseDateCreated', AttributeType: 'S' }, { AttributeName: 'supplierId', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' }, { AttributeName: 'purchaseId', AttributeType: 'S' },
      { AttributeName: 'itemSort', AttributeType: 'S' }
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
      }
    ]
  }));
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
}
