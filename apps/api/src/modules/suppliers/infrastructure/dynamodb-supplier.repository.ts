import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, TransactWriteCommand,
  type TransactWriteCommandInput
} from '@aws-sdk/lib-dynamodb';
import type { SupplierListOptions, SupplierPage, SupplierRepository } from '../domain/supplier.repository.js';
import { SupplierTaxIdUniquenessError } from '../domain/supplier.repository.js';
import type { Supplier } from '../domain/supplier.js';

const entityType = 'SUPPLIER';
export class DynamoDbSupplierRepository implements SupplierRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string) {}
  async findById(id: string): Promise<Supplier | null> {
    const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: supplierKey(id) } }));
    return toSupplier(result.Item);
  }
  async findByTaxId(taxId: string): Promise<Supplier | null> {
    const lock = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: taxIdKey(taxId) } }));
    const id = lock.Item?.['supplierId']; return typeof id === 'string' ? this.findById(id) : null;
  }
  async list(options: SupplierListOptions): Promise<SupplierPage> {
    const names: Record<string, string> = { '#type': 'entityType' };
    const values: Record<string, unknown> = { ':type': entityType };
    const filters = ['#type = :type'];
    if (options.status) {
      names['#status'] = 'status'; values[':status'] = options.status; filters.push('#status = :status');
    }
    if (options.search) {
      names['#business'] = 'normalizedBusinessName'; names['#trade'] = 'normalizedTradeName'; names['#tax'] = 'normalizedTaxId';
      values[':search'] = options.search;
      filters.push('(contains(#business, :search) OR contains(#trade, :search) OR contains(#tax, :search))');
    }
    const result = await this.client.send(new ScanCommand({
      TableName: this.tableName, Limit: options.limit, FilterExpression: filters.join(' AND '),
      ExpressionAttributeNames: names, ExpressionAttributeValues: values,
      ...(options.nextToken ? { ExclusiveStartKey: decodeToken(options.nextToken) } : {})
    }));
    return {
      items: (result.Items ?? []).map(toSupplier).filter((item): item is Supplier => item !== null)
        .sort((left, right) => left.businessName.localeCompare(right.businessName)),
      ...(result.LastEvaluatedKey ? { nextToken: encodeToken(result.LastEvaluatedKey as Record<string, unknown>) } : {})
    };
  }
  async create(supplier: Supplier): Promise<void> {
    if (!supplier.taxId) {
      await this.client.send(new PutCommand({
        TableName: this.tableName, Item: toItem(supplier), ConditionExpression: 'attribute_not_exists(pk)'
      })); return;
    }
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: [
        { Put: { TableName: this.tableName, Item: toItem(supplier), ConditionExpression: 'attribute_not_exists(pk)' } },
        { Put: { TableName: this.tableName, Item: taxLock(supplier.taxId, supplier.id), ConditionExpression: 'attribute_not_exists(pk)' } }
      ] }));
    } catch (error: unknown) { this.rethrowTransaction(error); }
  }
  async update(supplier: Supplier, previousTaxId?: string): Promise<void> {
    if (supplier.taxId === previousTaxId) {
      await this.client.send(new PutCommand({
        TableName: this.tableName, Item: toItem(supplier), ConditionExpression: 'attribute_exists(pk)'
      })); return;
    }
    const operations: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      { Put: { TableName: this.tableName, Item: toItem(supplier), ConditionExpression: 'attribute_exists(pk)' } }
    ];
    if (supplier.taxId) operations.push({
      Put: { TableName: this.tableName, Item: taxLock(supplier.taxId, supplier.id), ConditionExpression: 'attribute_not_exists(pk)' }
    });
    if (previousTaxId) operations.push({ Delete: { TableName: this.tableName, Key: { pk: taxIdKey(previousTaxId) } } });
    try { await this.client.send(new TransactWriteCommand({ TransactItems: operations })); }
    catch (error: unknown) { this.rethrowTransaction(error); }
  }
  private rethrowTransaction(error: unknown): never {
    if (error instanceof TransactionCanceledException) throw new SupplierTaxIdUniquenessError();
    throw error;
  }
}
function supplierKey(id: string): string { return `SUPPLIER#${id}`; }
function taxIdKey(taxId: string): string { return `TAX_ID#${taxId}`; }
function taxLock(taxId: string, supplierId: string): Record<string, unknown> {
  return { pk: taxIdKey(taxId), entityType: 'SUPPLIER_TAX_ID', supplierId };
}
function toItem(supplier: Supplier): Record<string, unknown> {
  return { pk: supplierKey(supplier.id), entityType, normalizedTaxId: supplier.taxId?.toLocaleLowerCase('es') ?? '', ...supplier };
}
function toSupplier(item: Record<string, unknown> | undefined): Supplier | null {
  if (!item || item['entityType'] !== entityType) return null;
  const { pk: _pk, entityType: _type, normalizedTaxId: _tax, ...supplier } = item;
  void _pk; void _type; void _tax; return supplier as unknown as Supplier;
}
function encodeToken(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}
function decodeToken(token: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new Error('Invalid pagination token'); }
}
