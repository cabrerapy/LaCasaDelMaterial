import { GetCommand, UpdateCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { UserApplicationError } from '../application/user-application-error.js';

// One pool per application environment; never derive a binding from username/email.
export class DynamoDbCognitoLinkRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string,
    private readonly now: () => number = Date.now) {}

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
    try { await this.transitionInactive(userId, sub, actorId, 'INACTIVE'); }
    catch (error: unknown) {
      if (error instanceof TransactionCanceledException && error.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed') {
        throw new UserApplicationError('La invitación no está disponible. Esperá 5 minutos desde el último intento y verificá el estado del usuario.', 409);
      }
      throw error;
    }
  }

  private async transitionInactive(userId: string, sub: string, actorId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    validate(userId, sub);
    validateSub(actorId);
    const values = { ':user': userId, ':sub': sub };
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const invitation = status === 'INACTIVE';
    // Reserve before Cognito/email. Do not clear this reservation after ambiguous failures.
    const invitationValues = invitation ? { ':notBefore': new Date(nowMs + 5 * 60 * 1000).toISOString() } : {};
    await this.client.send(new TransactWriteCommand({ ClientRequestToken: randomUUID(), TransactItems: [
      { Update: { TableName: this.tableName, Key: { id: userId },
        UpdateExpression: 'SET #status = :active, updatedAt = :now, updatedBy = :actor' +
          (invitation ? ', cognitoInvitationRequestedAt = :now, cognitoInvitationNotBefore = :notBefore' : ''),
        ConditionExpression: 'attribute_exists(username) AND #status = :inactive AND passwordHash = :cognito AND attribute_not_exists(cognitoDeactivatedAt)' +
          (invitation ? ' AND (attribute_not_exists(cognitoInvitationNotBefore) OR cognitoInvitationNotBefore <= :now)' : ''),
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':active': status, ':inactive': 'INACTIVE', ':cognito': '!COGNITO_ONLY',
          ':now': now, ':actor': actorId, ...invitationValues } } },
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

  async deactivateNonAdmin(userId: string, sub: string, actorId: string, reason: string): Promise<void> {
    validate(userId, sub);
    validateSub(actorId);
    if (userId === actorId || reason.trim().length < 5 || reason.length > 500) throw new Error('Invalid deactivation');
    await this.client.send(new TransactWriteCommand({ ClientRequestToken: randomUUID(), TransactItems: [
      { Update: { TableName: this.tableName, Key: { id: userId },
        UpdateExpression: 'SET #status = :inactive, updatedAt = :now, updatedBy = :actor, cognitoDeactivationReason = :reason, cognitoDeactivatedAt = :now',
        ConditionExpression: 'attribute_exists(username) AND passwordHash = :cognito AND #role <> :admin',
        ExpressionAttributeNames: { '#status': 'status', '#role': 'role' },
        ExpressionAttributeValues: { ':inactive': 'INACTIVE', ':now': new Date(this.now()).toISOString(),
          ':actor': actorId, ':reason': reason.trim(), ':cognito': '!COGNITO_ONLY', ':admin': 'ADMIN' } } },
      { ConditionCheck: { TableName: this.tableName, Key: { id: actorId },
        ConditionExpression: '#role = :admin AND #status = :active',
        ExpressionAttributeNames: { '#role': 'role', '#status': 'status' },
        ExpressionAttributeValues: { ':admin': 'ADMIN', ':active': 'ACTIVE' } } },
      ...[`COGNITO_SUB#${sub}`, `COGNITO_USER#${userId}`].map(id => ({
        ConditionCheck: { TableName: this.tableName, Key: { id },
          ConditionExpression: 'userId = :user AND sub = :sub',
          ExpressionAttributeValues: { ':user': userId, ':sub': sub } }
      }))
    ] }));
  }
}

function validateSub(sub: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) throw new Error('Invalid Cognito subject');
}
function validate(userId: string, sub: string): void {
  validateSub(sub);
  validateSub(userId);
}
