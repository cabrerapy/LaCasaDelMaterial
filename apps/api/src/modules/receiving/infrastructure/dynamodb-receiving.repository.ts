import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { InventoryMovement } from '../../inventory/domain/inventory.js';
import type { DynamoDbInventoryRepository } from '../../inventory/infrastructure/dynamodb-inventory.repository.js';
import type { Purchase, PurchaseItem } from '../../purchases/domain/purchase.js';
import type { LotListOptions, LotPage, ReceiptListOptions, ReceiptPage, ReceivingRepository } from '../domain/receiving.repository.js';
import { ReceivingConflictError } from '../domain/receiving.repository.js';
import type { PurchaseLot, PurchaseReceipt, PurchaseReceiptLine } from '../domain/receiving.js';

type TxItems = NonNullable<TransactWriteCommandInput['TransactItems']>;
export class DynamoDbReceivingRepository implements ReceivingRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string, private readonly inventory: DynamoDbInventoryRepository) {}
  async findReceiptById(id: string): Promise<PurchaseReceipt | null> { const value = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: `RECEIPT#${id}` }, ConsistentRead: true })); return parse<PurchaseReceipt>(value.Item, 'RECEIPT'); }
  async findReceiptByNumber(number: string): Promise<PurchaseReceipt | null> { const value = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: `RECEIPT_NUMBER#${number}` } })); const id = value.Item?.['receiptId']; return typeof id === 'string' ? this.findReceiptById(id) : null; }
  async listReceiptLines(receiptId: string): Promise<readonly PurchaseReceiptLine[]> {
    const lines: PurchaseReceiptLine[] = []; let key: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(new ScanCommand({ TableName: this.tableName, ConsistentRead: true, Limit: 100,
        FilterExpression: 'entityType = :type AND receiptId = :id', ExpressionAttributeValues: { ':type': 'RECEIPT_LINE', ':id': receiptId },
        ...(key ? { ExclusiveStartKey: key } : {}) }));
      lines.push(...(result.Items ?? []).map((item) => parse<PurchaseReceiptLine>(item, 'RECEIPT_LINE')).filter(exists)); key = result.LastEvaluatedKey;
    } while (key);
    return lines;
  }
  async listReceipts(options: ReceiptListOptions): Promise<ReceiptPage> {
    const indexName = options.purchaseId ? 'PurchaseItemsIndex' : options.supplierId ? 'SupplierDateIndex' : options.status ? 'StatusDateIndex' : 'PurchaseDateIndex';
    const partition = options.purchaseId ? 'purchaseId' : options.supplierId ? 'supplierId' : options.status ? 'status' : 'entityType';
    const value = options.purchaseId ?? options.supplierId ?? options.status ?? 'RECEIPT'; const range = options.purchaseId ? 'itemSort' : 'purchaseDateCreated';
    const names: Record<string, string> = { '#p': partition, ...((options.purchaseId || options.dateFrom || options.dateTo) ? { '#r': range } : {}) }; const values: Record<string, unknown> = { ':p': value }; let condition = '#p = :p';
    if (options.purchaseId) { values[':prefix'] = 'RECEIPT#'; condition += ' AND begins_with(#r, :prefix)'; }
    else if (options.dateFrom || options.dateTo) { values[':from'] = `${options.dateFrom ?? '0000-01-01'}#`; values[':to'] = `${options.dateTo ?? '9999-12-31'}#\uffff`; condition += ' AND #r BETWEEN :from AND :to'; }
    const filters: string[] = [];
    if (options.status && indexName !== 'StatusDateIndex') { names['#status'] = 'status'; values[':status'] = options.status; filters.push('#status = :status'); }
    if (options.search) { names['#search'] = 'receiptSearch'; values[':search'] = options.search.toLocaleLowerCase('es'); filters.push('contains(#search, :search)'); }
    const result = await this.client.send(new QueryCommand({ TableName: this.tableName, IndexName: indexName, KeyConditionExpression: condition, ExpressionAttributeNames: names, ExpressionAttributeValues: values, ScanIndexForward: false, Limit: options.limit, ...(filters.length ? { FilterExpression: filters.join(' AND ') } : {}), ...(options.nextToken ? { ExclusiveStartKey: decode(options.nextToken) } : {}) }));
    return { items: (result.Items ?? []).map((item) => parse<PurchaseReceipt>(item, 'RECEIPT')).filter(exists), ...(result.LastEvaluatedKey ? { nextToken: encode(result.LastEvaluatedKey as Record<string, unknown>) } : {}) };
  }
  async createReceipt(receipt: PurchaseReceipt, lines: readonly PurchaseReceiptLine[]): Promise<void> { await this.write([unique(receiptRecord(receipt)), unique({ pk: `RECEIPT_NUMBER#${receipt.receiptNumber}`, entityType: 'RECEIPT_NUMBER', receiptId: receipt.id }), ...lines.map((line) => unique(lineRecord(line)))]); }
  async replaceReceipt(receipt: PurchaseReceipt, lines: readonly PurchaseReceiptLine[], previous: readonly PurchaseReceiptLine[], expectedStatus: PurchaseReceipt['status']): Promise<void> {
    const next = new Set(lines.map((line) => line.id)); await this.write([{ Put: { TableName: this.tableName, Item: receiptRecord(receipt), ConditionExpression: '#status = :expected', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':expected': expectedStatus } } }, ...previous.filter((line) => !next.has(line.id)).map((line) => ({ Delete: { TableName: this.tableName, Key: { pk: `RECEIPT_LINE#${line.id}` } } })), ...lines.map((line) => ({ Put: { TableName: this.tableName, Item: lineRecord(line) } }))]);
  }
  async confirmReceipt(receipt: PurchaseReceipt, lines: readonly PurchaseReceiptLine[], lots: readonly PurchaseLot[], purchase: Purchase, items: readonly PurchaseItem[], expectedPurchaseUpdatedAt: string, movements: readonly InventoryMovement[], expectedReceiptUpdatedAt: string): Promise<void> {
    const operations: TxItems = [
      { Put: { TableName: this.tableName, Item: receiptRecord(receipt), ConditionExpression: '#status = :draft AND updatedAt = :expected', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':draft': 'DRAFT', ':expected': expectedReceiptUpdatedAt } } },
      { Put: { TableName: this.tableName, Item: purchaseRecord(purchase), ConditionExpression: '#status IN (:confirmed, :partial) AND #updatedAt = :expectedUpdatedAt', ExpressionAttributeNames: { '#status': 'status', '#updatedAt': 'updatedAt' }, ExpressionAttributeValues: { ':confirmed': 'CONFIRMED', ':partial': 'PARTIALLY_RECEIVED', ':expectedUpdatedAt': expectedPurchaseUpdatedAt } } },
      ...items.filter((item) => lines.some((line) => line.purchaseItemId === item.id)).map((item) => ({ Put: { TableName: this.tableName, Item: purchaseItemRecord(item) } })),
      ...lines.map((line) => ({ Put: { TableName: this.tableName, Item: lineRecord(line) } })),
      ...lots.flatMap((lot) => [unique(lotRecord(lot)), unique({ pk: `LOT_NUMBER#${lot.lotNumber}`, entityType: 'LOT_NUMBER', lotId: lot.id })])
      , ...this.inventory.transactionItems(movements)
    ]; if (operations.length > 100) throw new Error('Receiving transaction exceeds DynamoDB limit'); await this.write(operations);
  }
  async auditSnapshot() {
    const records: Record<string, unknown>[] = []; let key: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(new ScanCommand({ TableName: this.tableName, ConsistentRead: true, Limit: 100,
        FilterExpression: 'entityType IN (:receipt, :line, :lot)', ExpressionAttributeValues: { ':receipt': 'RECEIPT', ':line': 'RECEIPT_LINE', ':lot': 'LOT' },
        ...(key ? { ExclusiveStartKey: key } : {}) }));
      records.push(...(result.Items ?? [])); key = result.LastEvaluatedKey;
    } while (key);
    return { receipts: records.map((item) => parse<PurchaseReceipt>(item, 'RECEIPT')).filter(exists),
      lines: records.map((item) => parse<PurchaseReceiptLine>(item, 'RECEIPT_LINE')).filter(exists),
      lots: records.map((item) => parse<PurchaseLot>(item, 'LOT')).filter(exists) };
  }
  async findLotById(id: string): Promise<PurchaseLot | null> { const value = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: `LOT#${id}` } })); return parse<PurchaseLot>(value.Item, 'LOT'); }
  async listLots(options: LotListOptions): Promise<LotPage> {
    const indexName = options.receiptId ? 'RelationIndex' : options.productId ? 'ProductDateIndex' : options.purchaseId ? 'PurchaseItemsIndex' : options.supplierId ? 'SupplierDateIndex' : 'PurchaseDateIndex';
    const partition = options.receiptId ? 'relationId' : options.productId ? 'productId' : options.purchaseId ? 'purchaseId' : options.supplierId ? 'supplierId' : 'entityType';
    const value = options.receiptId ?? options.productId ?? options.purchaseId ?? options.supplierId ?? 'LOT'; const range = options.receiptId ? 'relationSort' : options.purchaseId ? 'itemSort' : options.productId ? 'receivedDateCreated' : 'purchaseDateCreated';
    const names: Record<string, string> = { '#p': partition, ...((options.receiptId || options.purchaseId || options.dateFrom || options.dateTo) ? { '#r': range } : {}) }; const values: Record<string, unknown> = { ':p': value }; let condition = '#p = :p';
    if (options.receiptId || options.purchaseId) { values[':prefix'] = 'LOT#'; condition += ' AND begins_with(#r, :prefix)'; }
    else if (options.dateFrom || options.dateTo) { values[':from'] = `${options.dateFrom ?? '0000-01-01'}#`; values[':to'] = `${options.dateTo ?? '9999-12-31'}#\uffff`; condition += ' AND #r BETWEEN :from AND :to'; }
    const result = await this.client.send(new QueryCommand({ TableName: this.tableName, IndexName: indexName, KeyConditionExpression: condition, ExpressionAttributeNames: names, ExpressionAttributeValues: values, ScanIndexForward: false, Limit: options.limit, ...(options.nextToken ? { ExclusiveStartKey: decode(options.nextToken) } : {}) }));
    return { items: (result.Items ?? []).map((item) => parse<PurchaseLot>(item, 'LOT')).filter(exists), ...(result.LastEvaluatedKey ? { nextToken: encode(result.LastEvaluatedKey as Record<string, unknown>) } : {}) };
  }
  private async write(items: TxItems): Promise<void> { const normalized = items.map((item) => item.Put?.TableName === '' ? { Put: { ...item.Put, TableName: this.tableName } } : item); try { await this.client.send(new TransactWriteCommand({ TransactItems: normalized })); } catch (error: unknown) { if (error instanceof TransactionCanceledException) throw new ReceivingConflictError(); throw error; } }
}
function receiptRecord(value: PurchaseReceipt): Record<string, unknown> { return { pk: `RECEIPT#${value.id}`, entityType: 'RECEIPT', purchaseDateCreated: `${value.receiptDate}#${value.createdAt}#${value.id}`, itemSort: `RECEIPT#${value.receiptDate}#${value.id}`, receiptSearch: `${value.receiptNumber} ${value.purchaseNumber} ${value.supplierSnapshot.businessName}`.toLocaleLowerCase('es'), ...value }; }
function lineRecord(value: PurchaseReceiptLine): Record<string, unknown> { return { pk: `RECEIPT_LINE#${value.id}`, entityType: 'RECEIPT_LINE', relationId: value.receiptId, relationSort: `LINE#${value.id}`, ...value }; }
function lotRecord(value: PurchaseLot): Record<string, unknown> { return { pk: `LOT#${value.id}`, entityType: 'LOT', purchaseDateCreated: `${value.receivedAt}#${value.createdAt}#${value.id}`, receivedDateCreated: `${value.receivedAt}#${value.createdAt}#${value.id}`, itemSort: `LOT#${value.receivedAt}#${value.id}`, relationId: value.receiptId, relationSort: `LOT#${value.receivedAt}#${value.id}`, ...value }; }
function purchaseRecord(value: Purchase): Record<string, unknown> { return { pk: `PURCHASE#${value.id}`, entityType: 'PURCHASE', purchaseDateCreated: `${value.purchaseDate}#${value.createdAt}#${value.id}`, normalizedPurchaseNumber: value.purchaseNumber.toLocaleLowerCase('es'), normalizedSupplierName: value.supplierSnapshot.businessName.toLocaleLowerCase('es'), ...value }; }
function purchaseItemRecord(value: PurchaseItem): Record<string, unknown> { return { pk: `PURCHASE_ITEM#${value.purchaseId}#${value.id}`, entityType: 'PURCHASE_ITEM', itemSort: `${String(value.sortOrder).padStart(7, '0')}#${value.id}`, ...value }; }
function unique(Item: Record<string, unknown>) { return { Put: { TableName: '', Item, ConditionExpression: 'attribute_not_exists(pk)' } }; }
function parse<T>(item: Record<string, unknown> | undefined, type: string): T | null { if (!item || item['entityType'] !== type) return null; const { pk: _pk, entityType: _type, purchaseDateCreated: _a, receivedDateCreated: _b, itemSort: _c, relationId: _d, relationSort: _e, receiptSearch: _f, ...value } = item; void _pk; void _type; void _a; void _b; void _c; void _d; void _e; void _f; return value as T; }
function exists<T>(value: T | null): value is T { return value !== null; }
function encode(value: Record<string, unknown>): string { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function decode(value: string): Record<string, unknown> { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>; }
