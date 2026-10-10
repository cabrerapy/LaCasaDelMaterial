import { GetCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// One pool per application environment; never derive a binding from username/email.
export class DynamoDbCognitoLinkRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string) {}

  async link(userId: string, sub: string): Promise<void> {
    validate(userId, sub);
    await this.client.send(new TransactWriteCommand({ TransactItems: [
      { ConditionCheck: { TableName: this.tableName, Key: { id: userId },
        ConditionExpression: 'attribute_exists(username)' } },
      { Put: { TableName: this.tableName, Item: { id: `COGNITO_SUB#${sub}`, userId, sub },
        ConditionExpression: 'attribute_not_exists(id) OR (userId = :user AND sub = :sub)',
        ExpressionAttributeValues: { ':user': userId, ':sub': sub } } },
      { Put: { TableName: this.tableName, Item: { id: `COGNITO_USER#${userId}`, userId, sub },
        ConditionExpression: 'attribute_not_exists(id) OR (userId = :user AND sub = :sub)',
        ExpressionAttributeValues: { ':user': userId, ':sub': sub } } }
    ] }));
  }

  async findUserId(sub: string): Promise<string | null> {
    validateSub(sub);
    const forward = await this.client.send(new GetCommand({ TableName: this.tableName,
      Key: { id: `COGNITO_SUB#${sub}` }, ConsistentRead: true }));
    const userId: unknown = forward.Item?.['userId'];
    if (typeof userId !== 'string' || forward.Item?.['sub'] !== sub) return null;
    validate(userId, sub);
    const reverse = await this.client.send(new GetCommand({ TableName: this.tableName,
      Key: { id: `COGNITO_USER#${userId}` }, ConsistentRead: true }));
    return reverse.Item?.['userId'] === userId && reverse.Item?.['sub'] === sub ? userId : null;
  }
}

function validateSub(sub: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) throw new Error('Invalid Cognito subject');
}
function validate(userId: string, sub: string): void {
  validateSub(sub);
  validateSub(userId);
}
