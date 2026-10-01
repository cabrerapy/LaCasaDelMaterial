import { ConditionalCheckFailedException, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand, PutCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { InventoryMovementFilters } from '@lcm/contracts';
import { aggregate, InventoryConflictError, sourceKey, type InventoryBalance, type InventoryMovement, type InventoryRepository } from '../domain/inventory.js';

export type InventoryTransaction = NonNullable<TransactWriteCommandInput['TransactItems']>;
export class DynamoDbInventoryRepository implements InventoryRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string) {}
  async get(id: string): Promise<InventoryMovement | null> { return this.read<InventoryMovement>(`MOVEMENT#${id}`); }
  async byNumber(number: string): Promise<InventoryMovement | null> {
    const lock = await this.read<{ movementId: string }>(`MOVEMENT_NUMBER#${number}`);
    return lock ? this.get(lock.movementId) : null;
  }
  async bySource(receiptId: string, lineId: string): Promise<InventoryMovement | null> {
    const lock = await this.read<{ movementId: string }>(sourceKey(receiptId, lineId));
    return lock ? this.get(lock.movementId) : null;
  }
  async getBalance(productId: string): Promise<InventoryBalance | null> {
    const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: `BALANCE#${productId}` }, ConsistentRead: true }));
    return result.Item ? balanceFromRecord(result.Item) : null;
  }
  private async read<T>(pk: string): Promise<T | null> {
    const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk }, ConsistentRead: true }));
    return result.Item ? result.Item['data'] as T : null;
  }
  async list(filters: InventoryMovementFilters) {
    const partition = filters.productId ? 'productId' : filters.lotId ? 'lotId' : filters.type ? 'type' : 'entityType';
    const index = { productId: 'MovementProductIndex', lotId: 'MovementLotIndex', type: 'MovementTypeIndex', entityType: 'MovementDateIndex' }[partition];
    const names: Record<string, string> = { '#partition': partition, '#date': 'chronology' };
    const values: Record<string, unknown> = { ':partition': filters.productId ?? filters.lotId ?? filters.type ?? 'MOVEMENT', ':from': filters.dateFrom ?? '0000', ':to': `${filters.dateTo ?? '9999-12-31'}T23:59:59.999Z#\uffff` };
    const conditions: string[] = [];
    for (const name of ['productId', 'lotId', 'type', 'sourceType'] as const) {
      if (filters[name] && name !== partition) { names[`#${name}`] = name; values[`:${name}`] = filters[name]; conditions.push(`#${name} = :${name}`); }
    }
    if (filters.search?.trim()) { names['#search'] = 'searchText'; values[':search'] = filters.search.trim().toLowerCase(); conditions.push('contains(#search, :search)'); }
    let key: Record<string, unknown> | undefined;
    if (filters.nextToken) {
      try { const decoded: unknown = JSON.parse(Buffer.from(filters.nextToken, 'base64url').toString());
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) || typeof (decoded as Record<string, unknown>)['pk'] !== 'string') throw new Error();
        key = decoded as Record<string, unknown>;
      } catch { throw Object.assign(new Error('Cursor inválido'), { statusCode: 400 }); }
    }
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName, IndexName: index, KeyConditionExpression: '#partition = :partition AND #date BETWEEN :from AND :to',
      ExpressionAttributeNames: names, ExpressionAttributeValues: values, Limit: filters.pageSize ?? 25, ScanIndexForward: false,
      ...(conditions.length ? { FilterExpression: conditions.join(' AND ') } : {}), ...(key ? { ExclusiveStartKey: key } : {})
    }));
    return { items: (result.Items ?? []).map((item) => item['data'] as InventoryMovement),
      ...(result.LastEvaluatedKey ? { nextToken: Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url') } : {}) };
  }
  /** Called only with postings prepared by InventoryService; joined to the receipt transaction by its adapter. */
  transactionItems(movements: readonly InventoryMovement[]): InventoryTransaction {
    const totals = aggregate(movements);
    const result: InventoryTransaction = movements.flatMap((movement) => [
      this.unique({ pk: `MOVEMENT#${movement.id}`, entityType: 'MOVEMENT', productId: movement.productId, lotId: movement.lotId,
        type: movement.type, sourceType: movement.sourceType, chronology: `${movement.occurredAt}#${movement.createdAt}#${movement.id}`,
        searchText: `${movement.movementNumber} ${movement.referenceNumber}`.toLowerCase(), data: movement }),
      this.unique({ pk: sourceKey(movement.sourceId, movement.sourceLineId), entityType: 'SOURCE', data: { movementId: movement.id } }),
      this.unique({ pk: `MOVEMENT_NUMBER#${movement.movementNumber}`, entityType: 'NUMBER', data: { movementId: movement.id } })
    ]);
    for (const [productId, delta] of totals) {
      // Flat projection attributes permit atomic ADD; never read/modify/write a live balance.
      result.push({ Update: {
        TableName: this.tableName, Key: { pk: `BALANCE#${productId}` },
        UpdateExpression: 'SET entityType = :entity, productId = :product, updatedAt = :now ADD onHandInternal :delta, #version :one',
        ConditionExpression: 'attribute_not_exists(onHandInternal) OR (onHandInternal >= :zero AND onHandInternal <= :maximum)',
        ExpressionAttributeNames: { '#version': 'version' },
        ExpressionAttributeValues: { ':entity': 'BALANCE', ':product': productId, ':now': new Date().toISOString(), ':delta': delta, ':one': 1, ':zero': 0, ':maximum': Number.MAX_SAFE_INTEGER - delta }
      } });
    }
    return result;
  }
  async append(movements: readonly InventoryMovement[]): Promise<void> {
    try { await this.client.send(new TransactWriteCommand({ TransactItems: this.transactionItems(movements) })); }
    catch (error: unknown) { if (error instanceof TransactionCanceledException) throw new InventoryConflictError(); throw error; }
  }
  private unique(Item: Record<string, unknown>) { return { Put: { TableName: this.tableName, Item, ConditionExpression: 'attribute_not_exists(pk)' } }; }
  async allMovements(): Promise<readonly InventoryMovement[]> { return (await this.scan('MOVEMENT')).map((item) => item['data'] as InventoryMovement); }
  async allBalances(): Promise<readonly InventoryBalance[]> { return (await this.scan('BALANCE')).map(balanceFromRecord); }
  private async scan(entity: string): Promise<Record<string, unknown>[]> {
    const records: Record<string, unknown>[] = []; let key: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(new ScanCommand({ TableName: this.tableName, ConsistentRead: true, Limit: 100,
        FilterExpression: 'entityType = :entity', ExpressionAttributeValues: { ':entity': entity }, ...(key ? { ExclusiveStartKey: key } : {}) }));
      records.push(...(result.Items ?? [])); key = result.LastEvaluatedKey;
    } while (key);
    return records;
  }
  async replaceBalance(balance: InventoryBalance, expectedVersion: number | null): Promise<void> {
    try { await this.client.send(new PutCommand({
      TableName: this.tableName, Item: { pk: `BALANCE#${balance.productId}`, entityType: 'BALANCE', ...balance },
      ConditionExpression: expectedVersion === null ? 'attribute_not_exists(pk)' : '#version = :expected',
      ...(expectedVersion === null ? {} : { ExpressionAttributeNames: { '#version': 'version' }, ExpressionAttributeValues: { ':expected': expectedVersion } })
    })); } catch (error: unknown) { if (error instanceof ConditionalCheckFailedException) throw new InventoryConflictError(); throw error; }
  }
}
function balanceFromRecord(item: Record<string, unknown>): InventoryBalance {
  return { productId: item['productId'] as string, onHandInternal: item['onHandInternal'] as number, version: item['version'] as number, updatedAt: item['updatedAt'] as string };
}
