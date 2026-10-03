import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { CashMovement, CashSession } from '../domain/cash.js';
import { CashConflictError, type CashListOptions, type CashMovementListOptions, type CashRepository } from '../domain/cash.repository.js';

export type CashTx = NonNullable<TransactWriteCommandInput['TransactItems']>;

export class DynamoDbCashRepository implements CashRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string) {}
  async current(user: string) { const lock = await this.get<{ sessionId: string }>(`OPEN_USER#${user}`); return lock ? this.findSession(lock.sessionId) : null; }
  async findSession(id: string) { return this.get<CashSession>(`SESSION#${id}`); }
  async list(o: CashListOptions) {
    const values: Record<string, unknown> = { ':entity': 'SESSION' }; let condition = 'entityType=:entity';
    if (o.dateFrom || o.dateTo) { values[':from'] = o.dateFrom ?? '0000'; values[':to'] = `${o.dateTo ?? '9999'}\uffff`; condition += ' AND openedAt BETWEEN :from AND :to'; }
    const filters: string[] = []; const names: Record<string, string> = {};
    if (o.status) { names['#status'] = 'status'; values[':status'] = o.status; filters.push('#status=:status'); }
    if (o.openedBy) { values[':user'] = o.openedBy; filters.push('openedBy=:user'); }
    const result = await this.client.send(new QueryCommand({ TableName: this.tableName, IndexName: 'SessionDateIndex', KeyConditionExpression: condition, ExpressionAttributeValues: values, ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}), ...(filters.length ? { FilterExpression: filters.join(' AND ') } : {}), Limit: o.limit, ScanIndexForward: false, ...(o.nextToken ? { ExclusiveStartKey: decode(o.nextToken) } : {}) }));
    return { items: (result.Items ?? []).map((item) => item['data'] as CashSession), ...(result.LastEvaluatedKey ? { nextToken: encode(result.LastEvaluatedKey) } : {}) };
  }
  async movements(id: string) { const result = await this.client.send(new QueryCommand({ TableName: this.tableName, IndexName: 'SessionMovementsIndex', KeyConditionExpression: 'cashSessionId=:id', ExpressionAttributeValues: { ':id': id }, ScanIndexForward: false, Limit: 100 })); return (result.Items ?? []).map((item) => item['data'] as CashMovement); }
  async listMovements(o: CashMovementListOptions) {
    const values: Record<string, unknown> = { ':pk': 'MOVEMENT' }; let condition = 'movementDatePk=:pk';
    if (o.dateFrom || o.dateTo) { values[':from'] = o.dateFrom ?? '0000'; values[':to'] = `${o.dateTo ?? '9999'}\uffff`; condition += ' AND occurredAt BETWEEN :from AND :to'; }
    const result = await this.client.send(new QueryCommand({ TableName: this.tableName, IndexName: 'CashMovementDateIndex', KeyConditionExpression: condition, ExpressionAttributeValues: values, Limit: o.limit, ScanIndexForward: false, ...(o.nextToken ? { ExclusiveStartKey: decode(o.nextToken) } : {}) }));
    return { items: (result.Items ?? []).map((item) => item['data'] as CashMovement), ...(result.LastEvaluatedKey ? { nextToken: encode(result.LastEvaluatedKey) } : {}) };
  }
  async open(s: CashSession) { await this.write([{ Put: { TableName: this.tableName, Item: sessionRecord(s), ConditionExpression: 'attribute_not_exists(pk)' } }, { Put: { TableName: this.tableName, Item: { pk: `OPEN_USER#${s.openedBy}`, entityType: 'OPEN_LOCK', data: { sessionId: s.id } }, ConditionExpression: 'attribute_not_exists(pk)' } }, { Put: { TableName: this.tableName, Item: { pk: `SESSION_NUMBER#${s.sessionNumber}`, entityType: 'NUMBER' }, ConditionExpression: 'attribute_not_exists(pk)' } }]); }
  transactionItems(m: CashMovement): CashTx { return [{ Put: { TableName: this.tableName, Item: { pk: `MOVEMENT#${m.id}`, entityType: 'MOVEMENT', movementDatePk: 'MOVEMENT', cashSessionId: m.cashSessionId, occurredAt: m.occurredAt, data: m }, ConditionExpression: 'attribute_not_exists(pk)' } }, { Put: { TableName: this.tableName, Item: { pk: `SOURCE#${m.type}#${m.sourceId}`, entityType: 'SOURCE' }, ConditionExpression: 'attribute_not_exists(pk)' } }, { Update: { TableName: this.tableName, Key: { pk: `SESSION#${m.cashSessionId}` }, UpdateExpression: 'SET expectedCashGuarani=expectedCashGuarani+:d, updatedAt=:now, #data.expectedCashGuarani=#data.expectedCashGuarani+:d, #data.updatedAt=:now', ConditionExpression: '#status=:open' + (m.type === 'MANUAL_OUT' ? ' AND expectedCashGuarani >= :amount' : ''), ExpressionAttributeNames: { '#status': 'status', '#data': 'data' }, ExpressionAttributeValues: { ':d': m.cashDeltaGuarani, ':now': m.createdAt, ':open': 'OPEN', ...(m.type === 'MANUAL_OUT' ? { ':amount': m.amountGuarani } : {}) } } }]; }
  async append(m: CashMovement) { await this.write(this.transactionItems(m)); }
  async close(s: CashSession, expected: string) { await this.write([{ Put: { TableName: this.tableName, Item: sessionRecord(s), ConditionExpression: '#status=:open AND updatedAt=:expected', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':open': 'OPEN', ':expected': expected } } }, { Delete: { TableName: this.tableName, Key: { pk: `OPEN_USER#${s.openedBy}` }, ConditionExpression: 'attribute_exists(pk)' } }]); }
  private async get<T>(pk: string) { const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk }, ConsistentRead: true })); return result.Item ? result.Item['data'] as T : null; }
  private async write(items: CashTx) { try { await this.client.send(new TransactWriteCommand({ TransactItems: items })); } catch (error) { if (error instanceof TransactionCanceledException) throw new CashConflictError(); throw error; } }
}
function sessionRecord(s: CashSession) { return { pk: `SESSION#${s.id}`, entityType: 'SESSION', status: s.status, openedBy: s.openedBy, openedAt: s.openedAt, expectedCashGuarani: s.expectedCashGuarani, updatedAt: s.updatedAt, data: s }; }
function encode(key: Record<string, unknown>): string { return Buffer.from(JSON.stringify(key)).toString('base64url'); }
function decode(token: string): Record<string, unknown> { try { return JSON.parse(Buffer.from(token, 'base64url').toString()) as Record<string, unknown>; } catch { throw Object.assign(new Error('Cursor inválido'), { statusCode: 400 }); } }
