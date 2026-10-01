import { CreateTableCommand, DescribeTableCommand, ResourceNotFoundException, waitUntilTableExists, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
export async function ensureInventoryTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try { await client.send(new DescribeTableCommand({ TableName: tableName })); return; }
  catch (error: unknown) { if (!(error instanceof ResourceNotFoundException)) throw error; }
  const partitions = ['entityType', 'productId', 'lotId', 'type'];
  await client.send(new CreateTableCommand({
    TableName: tableName, BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    AttributeDefinitions: ['pk', 'chronology', ...partitions].map((AttributeName) => ({ AttributeName, AttributeType: 'S' })),
    GlobalSecondaryIndexes: partitions.map((partition, index) => ({
      IndexName: ['MovementDateIndex', 'MovementProductIndex', 'MovementLotIndex', 'MovementTypeIndex'][index]!,
      KeySchema: [{ AttributeName: partition, KeyType: 'HASH' }, { AttributeName: 'chronology', KeyType: 'RANGE' }],
      Projection: { ProjectionType: 'ALL' }
    }))
  }));
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
}
