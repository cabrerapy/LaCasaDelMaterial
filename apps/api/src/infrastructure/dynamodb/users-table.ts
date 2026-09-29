import {
  CreateTableCommand,
  DescribeTableCommand,
  type DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists
} from '@aws-sdk/client-dynamodb';

export async function ensureUsersTable(
  client: DynamoDBClient,
  tableName: string
): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return;
  } catch (error: unknown) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error;
    }
  }

  await client.send(new CreateTableCommand({
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'username', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' }
    ],
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'UsernameIndex',
        KeySchema: [{ AttributeName: 'username', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' }
      }
    ]
  }));

  await waitUntilTableExists(
    { client, maxWaitTime: 30 },
    { TableName: tableName }
  );
}
