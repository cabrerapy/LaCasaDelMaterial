import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import type { User } from '../domain/user.js';
import type { UserPage, UserRepository } from '../domain/user.repository.js';

export class DynamoDbUserRepository implements UserRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { id }
    }));
    return (result.Item as User | undefined) ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.findByIndex('UsernameIndex', 'username', username.toLowerCase());
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findByIndex('EmailIndex', 'email', email.toLowerCase());
  }

  async create(user: User): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: user,
      ConditionExpression: 'attribute_not_exists(id)'
    }));
  }

  async update(user: User): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: user,
      ConditionExpression: 'attribute_exists(id)'
    }));
  }

  async list(limit: number, nextToken?: string): Promise<UserPage> {
    const result = await this.client.send(new ScanCommand({
      TableName: this.tableName,
      Limit: limit,
      ...(nextToken ? { ExclusiveStartKey: decodeToken(nextToken) } : {})
    }));
    return {
      items: (result.Items ?? []) as User[],
      ...(result.LastEvaluatedKey
        ? { nextToken: encodeToken(result.LastEvaluatedKey as Record<string, unknown>) }
        : {})
    };
  }

  async countActiveAdmins(): Promise<number> {
    let count = 0;
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(new ScanCommand({
        TableName: this.tableName,
        Select: 'COUNT',
        FilterExpression: '#role = :admin AND #status = :active',
        ExpressionAttributeNames: { '#role': 'role', '#status': 'status' },
        ExpressionAttributeValues: { ':admin': 'ADMIN', ':active': 'ACTIVE' },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {})
      }));
      count += result.Count ?? 0;
      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);
    return count;
  }

  private async findByIndex(
    indexName: string,
    attributeName: 'username' | 'email',
    value: string
  ): Promise<User | null> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: indexName,
      KeyConditionExpression: '#key = :value',
      ExpressionAttributeNames: { '#key': attributeName },
      ExpressionAttributeValues: { ':value': value },
      Limit: 1
    }));
    return (result.Items?.[0] as User | undefined) ?? null;
  }
}

function encodeToken(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

function decodeToken(token: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid pagination token');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('Invalid pagination token');
  }
}
