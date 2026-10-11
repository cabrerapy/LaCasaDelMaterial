import { GetCommand, UpdateCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

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

  async activateInactive(userId: string, sub: string, actorId: string): Promise<void> {
    return this.transitionInactive(userId, sub, actorId, 'ACTIVE');
  }

  async prepareInvitation(userId: string, sub: string, actorId: string): Promise<void> {
    return this.transitionInactive(userId, sub, actorId, 'INACTIVE');
  }

  private async transitionInactive(userId: string, sub: string, actorId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    validate(userId, sub);
    validateSub(actorId);
    const values = { ':user': userId, ':sub': sub };
    await this.client.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: this.tableName, Key: { id: userId },
        UpdateExpression: 'SET #status = :active, updatedAt = :now, updatedBy = :actor',
        ConditionExpression: 'attribute_exists(username) AND #status = :inactive AND passwordHash = :cognito',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':active': status, ':inactive': 'INACTIVE', ':cognito': '!COGNITO_ONLY',
          ':now': new Date().toISOString(), ':actor': actorId } } },
      { ConditionCheck: { TableName: this.tableName, Key: { id: actorId },
        ConditionExpression: '#role = :admin AND #status = :active',
        ExpressionAttributeNames: { '#role': 'role', '#status': 'status' },
        ExpressionAttributeValues: { ':admin': 'ADMIN', ':active': 'ACTIVE' } } },
      ...[`COGNITO_SUB#${sub}`, `COGNITO_USER#${userId}`].map(id => ({
        ConditionCheck: { TableName: this.tableName, Key: { id },
          ConditionExpression: 'userId = :user AND sub = :sub', ExpressionAttributeValues: values }
      }))
    ] }));
  }

  async deactivateAfterFailure(userId: string, actorId: string): Promise<void> {
    validate(userId, actorId);
    await this.client.send(new UpdateCommand({ TableName: this.tableName, Key: { id: userId },
      UpdateExpression: 'SET #status = :inactive, updatedAt = :now, updatedBy = :actor',
      ConditionExpression: 'attribute_exists(username) AND passwordHash = :cognito',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':inactive': 'INACTIVE', ':cognito': '!COGNITO_ONLY',
        ':now': new Date().toISOString(), ':actor': actorId } }));
  }
}

function validateSub(sub: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) throw new Error('Invalid Cognito subject');
}
function validate(userId: string, sub: string): void {
  validateSub(sub);
  validateSub(userId);
}
