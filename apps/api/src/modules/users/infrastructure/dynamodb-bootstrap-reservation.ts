import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface BootstrapReservation {
  readonly operationId: string;
  readonly userId: string;
  readonly operatorArn: string;
  readonly createdAt: string;
}
const key = 'BOOTSTRAP#FIRST_ADMIN';

// CLI-only candidate. No TTL, deletion, automatic takeover or activation.
export class DynamoDbBootstrapReservation {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string,
    private readonly accountId: string) {}

  async reserve(value: BootstrapReservation): Promise<void> {
    this.validate(value);
    await this.client.send(new PutCommand({ TableName: this.tableName,
      Item: { id: key, ...value, state: 'RESERVED' }, ConditionExpression: 'attribute_not_exists(id)' }));
  }

  async resume(operationId: string, operatorArn: string): Promise<BootstrapReservation> {
    const response = await this.client.send(new GetCommand({ TableName: this.tableName,
      Key: { id: key }, ConsistentRead: true }));
    const item = response.Item;
    if (!item || item['state'] !== 'RESERVED' || item['operationId'] !== operationId ||
      item['operatorArn'] !== operatorArn || typeof item['userId'] !== 'string' ||
      typeof item['createdAt'] !== 'string') throw new Error('Bootstrap reservation requires reconciliation');
    const value = { operationId, operatorArn, userId: item['userId'], createdAt: item['createdAt'] };
    this.validate(value);
    return value;
  }

  private validate(value: BootstrapReservation): void {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(value.operationId) || !uuid.test(value.userId) || !/^\d{12}$/.test(this.accountId) ||
      !value.operatorArn.startsWith(`arn:aws:iam::${this.accountId}:user/`) ||
      !/^arn:aws:iam::\d{12}:user\/[A-Za-z0-9+=,.@_\/-]+$/.test(value.operatorArn) ||
      !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt) {
      throw new Error('Invalid bootstrap reservation');
    }
  }
}
