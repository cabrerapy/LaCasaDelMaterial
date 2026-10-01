import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand, TransactWriteCommand,
  type TransactWriteCommandInput
} from '@aws-sdk/lib-dynamodb';
import type {
  PurchaseListOptions, PurchasePage, PurchaseRepository
} from '../domain/purchase.repository.js';
import { PurchaseConflictError } from '../domain/purchase.repository.js';
import type { Purchase, PurchaseItem } from '../domain/purchase.js';

const purchaseType = 'PURCHASE';
const itemType = 'PURCHASE_ITEM';
export class DynamoDbPurchaseRepository implements PurchaseRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string) {}
  async findById(id: string): Promise<Purchase | null> {
    const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: purchaseKey(id) }, ConsistentRead: true }));
    return toPurchase(result.Item);
  }
  async findByPurchaseNumber(number: string): Promise<Purchase | null> {
    const lock = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: numberKey(number) } }));
    const id = lock.Item?.['purchaseId']; return typeof id === 'string' ? this.findById(id) : null;
  }
  async listItems(purchaseId: string): Promise<readonly PurchaseItem[]> {
    const records: Record<string, unknown>[] = []; let key: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(new ScanCommand({
        TableName: this.tableName, ConsistentRead: true, Limit: 100,
        FilterExpression: 'purchaseId = :purchaseId AND entityType = :type',
        ExpressionAttributeValues: { ':purchaseId': purchaseId, ':type': itemType },
        ...(key ? { ExclusiveStartKey: key } : {})
      }));
      records.push(...(result.Items ?? [])); key = result.LastEvaluatedKey;
    } while (key);
    return records.map(parsePurchaseItem).filter((item): item is PurchaseItem => item !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async list(options: PurchaseListOptions): Promise<PurchasePage> {
    const indexName = options.supplierId ? 'SupplierDateIndex' : options.status ? 'StatusDateIndex' : 'PurchaseDateIndex';
    const partitionName = options.supplierId ? 'supplierId' : options.status ? 'status' : 'entityType';
    const partitionValue = options.supplierId ?? options.status ?? purchaseType;
    const names: Record<string, string> = { '#partition': partitionName, '#date': 'purchaseDateCreated' };
    const values: Record<string, unknown> = { ':partition': partitionValue };
    let keyCondition = '#partition = :partition';
    if (options.dateFrom || options.dateTo) {
      values[':from'] = `${options.dateFrom ?? '0000-01-01'}#`;
      values[':to'] = `${options.dateTo ?? '9999-12-31'}#\uffff`;
      keyCondition += ' AND #date BETWEEN :from AND :to';
    }
    const filters: string[] = [];
    if (options.supplierId && options.status) {
      names['#status'] = 'status'; values[':status'] = options.status; filters.push('#status = :status');
    }
    if (options.search) {
      names['#number'] = 'normalizedPurchaseNumber'; names['#invoice'] = 'normalizedSupplierInvoiceNumber';
      names['#supplierName'] = 'normalizedSupplierName'; values[':search'] = options.search;
      filters.push('(contains(#number, :search) OR contains(#invoice, :search) OR contains(#supplierName, :search))');
    }
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName, IndexName: indexName,
      KeyConditionExpression: keyCondition, ExpressionAttributeNames: names,
      ExpressionAttributeValues: values, ScanIndexForward: false, Limit: options.limit,
      ...(filters.length ? { FilterExpression: filters.join(' AND ') } : {}),
      ...(options.nextToken ? { ExclusiveStartKey: decodeToken(options.nextToken) } : {})
    }));
    return {
      items: (result.Items ?? []).map(toPurchase).filter((item): item is Purchase => item !== null),
      ...(result.LastEvaluatedKey ? { nextToken: encodeToken(result.LastEvaluatedKey as Record<string, unknown>) } : {})
    };
  }
  async create(purchase: Purchase, items: readonly PurchaseItem[]): Promise<void> {
    const operations: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      putUnique(toPurchaseRecord(purchase)),
      putUnique({ pk: numberKey(purchase.purchaseNumber), entityType: 'PURCHASE_NUMBER', purchaseId: purchase.id }),
      ...items.map((item) => putUnique(toItemRecord(item)))
    ];
    try { await this.client.send(new TransactWriteCommand({ TransactItems: withTable(operations, this.tableName) })); }
    catch (error: unknown) { this.rethrowTransaction(error); }
  }
  async replace(
    purchase: Purchase,
    items: readonly PurchaseItem[],
    previousItems: readonly PurchaseItem[],
    expectedStatus: Purchase['status']
  ): Promise<void> {
    const nextIds = new Set(items.map((item) => item.id));
    const operations: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      { Put: {
        TableName: this.tableName, Item: toPurchaseRecord(purchase),
        ConditionExpression: '#status = :expectedStatus',
        ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':expectedStatus': expectedStatus }
      } },
      ...previousItems.filter((item) => !nextIds.has(item.id)).map((item) => ({
        Delete: { TableName: this.tableName, Key: { pk: itemKey(item.purchaseId, item.id) } }
      })),
      ...items.map((item) => ({ Put: { TableName: this.tableName, Item: toItemRecord(item) } }))
    ];
    if (operations.length > 25) throw new Error('Purchase transaction exceeds DynamoDB limit');
    try { await this.client.send(new TransactWriteCommand({ TransactItems: operations })); }
    catch (error: unknown) { this.rethrowTransaction(error); }
  }
  private rethrowTransaction(error: unknown): never {
    if (error instanceof TransactionCanceledException) throw new PurchaseConflictError(); throw error;
  }
}
function purchaseKey(id: string): string { return `PURCHASE#${id}`; }
function numberKey(number: string): string { return `PURCHASE_NUMBER#${number}`; }
function itemKey(purchaseId: string, id: string): string { return `PURCHASE_ITEM#${purchaseId}#${id}`; }
function toPurchaseRecord(purchase: Purchase): Record<string, unknown> {
  return {
    pk: purchaseKey(purchase.id), entityType: purchaseType,
    purchaseDateCreated: `${purchase.purchaseDate}#${purchase.createdAt}#${purchase.id}`,
    normalizedPurchaseNumber: purchase.purchaseNumber.toLocaleLowerCase('es'),
    normalizedSupplierName: purchase.supplierSnapshot.businessName.toLocaleLowerCase('es'), ...purchase
  };
}
function toItemRecord(item: PurchaseItem): Record<string, unknown> {
  return {
    pk: itemKey(item.purchaseId, item.id), entityType: itemType,
    itemSort: `${String(item.sortOrder).padStart(7, '0')}#${item.id}`, ...item
  };
}
function toPurchase(item: Record<string, unknown> | undefined): Purchase | null {
  if (!item || item['entityType'] !== purchaseType) return null;
  const {
    pk: _pk, entityType: _type, purchaseDateCreated: _date,
    normalizedPurchaseNumber: _number, normalizedSupplierName: _supplier, ...purchase
  } = item;
  void _pk; void _type; void _date; void _number; void _supplier; return purchase as unknown as Purchase;
}
function parsePurchaseItem(item: Record<string, unknown> | undefined): PurchaseItem | null {
  if (!item || item['entityType'] !== itemType) return null;
  const { pk: _pk, entityType: _type, itemSort: _sort, ...value } = item;
  void _pk; void _type; void _sort; return value as unknown as PurchaseItem;
}
function putUnique(Item: Record<string, unknown>) {
  return { Put: { TableName: '', Item, ConditionExpression: 'attribute_not_exists(pk)' } };
}
function withTable(
  items: NonNullable<TransactWriteCommandInput['TransactItems']>, tableName: string
): NonNullable<TransactWriteCommandInput['TransactItems']> {
  return items.map((item) => item.Put ? { Put: { ...item.Put, TableName: tableName } } : item);
}
function encodeToken(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}
function decodeToken(token: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>;
  } catch { throw new Error('Invalid pagination token'); }
}
