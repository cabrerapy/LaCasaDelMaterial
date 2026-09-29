import {
  CreateTableCommand,
  DescribeTableCommand,
  type DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists
} from '@aws-sdk/client-dynamodb';

export async function ensureProductsTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return;
  } catch (error: unknown) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }
  await client.send(new CreateTableCommand({
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }]
  }));
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
}
