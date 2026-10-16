import { GetCommand, PutCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

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

  async createPending(value: BootstrapReservation, profile: { name: string; username: string; email: string }): Promise<void> {
    this.validate(value);
    const name = profile.name.trim();
    const username = profile.username.trim().toLowerCase();
    const email = profile.email.trim().toLowerCase();
    if (name.length < 2 || name.length > 120 || !/^[a-z0-9._-]{3,40}$/.test(username) ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid bootstrap profile');
    await this.client.send(new TransactWriteCommand({ ClientRequestToken: value.operationId, TransactItems: [
      { Update: { TableName: this.tableName, Key: { id: key },
        UpdateExpression: 'SET profileCreatedAt = :created',
        ConditionExpression: 'operationId = :operation AND userId = :user AND operatorArn = :operator AND #state = :reserved AND attribute_not_exists(profileCreatedAt)',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: { ':operation': value.operationId, ':user': value.userId,
          ':operator': value.operatorArn, ':reserved': 'RESERVED', ':created': value.createdAt } } },
      { Put: { TableName: this.tableName, ConditionExpression: 'attribute_not_exists(id)',
        Item: { id: value.userId, name, username, email, role: 'ADMIN', status: 'INACTIVE',
          passwordHash: '!COGNITO_ONLY', createdAt: value.createdAt, updatedAt: value.createdAt,
          bootstrapOperationId: value.operationId, bootstrapOperatorArn: value.operatorArn } } }
    ] }));
  }

  async inspectPending(operationId: string, operatorArn: string): Promise<{
    reservation: BootstrapReservation; profile: { name: string; username: string; email: string };
  }> {
    const reservation = await this.resume(operationId, operatorArn);
    const response = await this.client.send(new GetCommand({ TableName: this.tableName,
      Key: { id: reservation.userId }, ConsistentRead: true }));
    const item = response.Item;
    if (!item || item['id'] !== reservation.userId || item['role'] !== 'ADMIN' || item['status'] !== 'INACTIVE' ||
      item['passwordHash'] !== '!COGNITO_ONLY' || item['bootstrapOperationId'] !== operationId ||
      item['bootstrapOperatorArn'] !== operatorArn || item['createdAt'] !== reservation.createdAt ||
      item['cognitoDeactivatedAt'] !== undefined || typeof item['name'] !== 'string' ||
      typeof item['username'] !== 'string' || typeof item['email'] !== 'string') {
      throw new Error('Pending bootstrap profile requires reconciliation');
    }
    if (item['name'].trim().length < 2 || item['name'].length > 120 ||
      !/^[a-z0-9._-]{3,40}$/.test(item['username']) || item['email'].length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item['email'])) throw new Error('Invalid pending bootstrap profile');
    return { reservation, profile: { name: item['name'], username: item['username'], email: item['email'] } };
  }

  async reserveInvitation(value: BootstrapReservation, sub: string, now: string): Promise<void> {
    this.validate(value);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub) ||
      !Number.isFinite(Date.parse(now)) || new Date(now).toISOString() !== now) throw new Error('Invalid bootstrap invitation');
    await this.client.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: this.tableName, Key: { id: key },
        UpdateExpression: 'SET invitationRequestedAt = :now, invitationNotBefore = :later',
        ConditionExpression: 'operationId = :operation AND userId = :user AND operatorArn = :operator AND #state = :reserved AND attribute_exists(profileCreatedAt) AND (attribute_not_exists(invitationNotBefore) OR invitationNotBefore <= :now)',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: { ':operation': value.operationId, ':user': value.userId, ':operator': value.operatorArn,
          ':reserved': 'RESERVED', ':now': now, ':later': new Date(Date.parse(now) + 300000).toISOString() } } },
      { ConditionCheck: { TableName: this.tableName, Key: { id: value.userId },
        ConditionExpression: '#role = :admin AND #status = :inactive AND passwordHash = :cognito AND bootstrapOperationId = :operation AND bootstrapOperatorArn = :operator AND attribute_not_exists(cognitoDeactivatedAt)',
        ExpressionAttributeNames: { '#role': 'role', '#status': 'status' },
        ExpressionAttributeValues: { ':admin': 'ADMIN', ':inactive': 'INACTIVE', ':cognito': '!COGNITO_ONLY',
          ':operation': value.operationId, ':operator': value.operatorArn } } },
      ...[`COGNITO_SUB#${sub}`, `COGNITO_USER#${value.userId}`].map(id => ({ ConditionCheck: {
        TableName: this.tableName, Key: { id }, ConditionExpression: 'userId = :user AND sub = :sub',
        ExpressionAttributeValues: { ':user': value.userId, ':sub': sub }
      } }))
    ] }));
  }

  async finalize(value: BootstrapReservation, sub: string, email: string, now: string): Promise<void> {
    this.validate(value);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email !== email.trim().toLowerCase() ||
      !Number.isFinite(Date.parse(now)) || new Date(now).toISOString() !== now) throw new Error('Invalid bootstrap finalization');
    await this.client.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: this.tableName, Key: { id: key },
        UpdateExpression: 'SET #state = :finalized, finalizedAt = :now, finalizedBy = :operator',
        ConditionExpression: 'operationId = :operation AND userId = :user AND operatorArn = :operator AND #state = :reserved AND attribute_exists(profileCreatedAt) AND attribute_exists(invitationRequestedAt)',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: { ':operation': value.operationId, ':user': value.userId, ':operator': value.operatorArn,
          ':reserved': 'RESERVED', ':finalized': 'FINALIZED', ':now': now } } },
      { Update: { TableName: this.tableName, Key: { id: value.userId },
        UpdateExpression: 'SET #status = :active, updatedAt = :now, bootstrapFinalizedAt = :now, bootstrapFinalizedBy = :operator',
        ConditionExpression: '#role = :admin AND #status = :inactive AND passwordHash = :cognito AND bootstrapOperationId = :operation AND bootstrapOperatorArn = :operator AND email = :email AND attribute_not_exists(cognitoDeactivatedAt)',
        ExpressionAttributeNames: { '#role': 'role', '#status': 'status' },
        ExpressionAttributeValues: { ':admin': 'ADMIN', ':inactive': 'INACTIVE', ':active': 'ACTIVE',
          ':cognito': '!COGNITO_ONLY', ':operation': value.operationId, ':operator': value.operatorArn, ':email': email, ':now': now } } },
      ...[`COGNITO_SUB#${sub}`, `COGNITO_USER#${value.userId}`].map(id => ({ ConditionCheck: {
        TableName: this.tableName, Key: { id }, ConditionExpression: 'userId = :user AND sub = :sub',
        ExpressionAttributeValues: { ':user': value.userId, ':sub': sub }
      } }))
    ] }));
  }

  async blockAfterFinalizationFailure(value: BootstrapReservation, now: string): Promise<void> {
    this.validate(value);
    if (!Number.isFinite(Date.parse(now)) || new Date(now).toISOString() !== now) throw new Error('Invalid bootstrap reconciliation date');
    await this.client.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: this.tableName, Key: { id: key },
        UpdateExpression: 'SET #state = :blocked, reconciliationRequiredAt = :now, reconciliationRequiredBy = :operator',
        ConditionExpression: 'operationId = :operation AND userId = :user AND operatorArn = :operator AND (#state = :reserved OR #state = :finalized OR #state = :blocked)',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: { ':operation': value.operationId, ':user': value.userId, ':operator': value.operatorArn,
          ':reserved': 'RESERVED', ':finalized': 'FINALIZED', ':blocked': 'RECONCILIATION_REQUIRED', ':now': now } } },
      { Update: { TableName: this.tableName, Key: { id: value.userId },
        UpdateExpression: 'SET #status = :inactive, updatedAt = :now, bootstrapReconciliationRequiredAt = :now, bootstrapReconciliationRequiredBy = :operator',
        ConditionExpression: '#role = :admin AND passwordHash = :cognito AND bootstrapOperationId = :operation AND bootstrapOperatorArn = :operator',
        ExpressionAttributeNames: { '#role': 'role', '#status': 'status' },
        ExpressionAttributeValues: { ':admin': 'ADMIN', ':inactive': 'INACTIVE', ':cognito': '!COGNITO_ONLY',
          ':operation': value.operationId, ':operator': value.operatorArn, ':now': now } } }
    ] }));
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
