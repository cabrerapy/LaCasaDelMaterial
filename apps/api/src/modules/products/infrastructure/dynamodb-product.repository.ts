import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput
} from '@aws-sdk/lib-dynamodb';
import type { ProductListOptions, ProductPage, ProductRepository } from '../domain/product.repository.js';
import { ProductUniquenessError } from '../domain/product.repository.js';
import type { Product, ProductPresentation } from '../domain/product.js';

const productType = 'PRODUCT';
const presentationType = 'PRODUCT_PRESENTATION';

export class DynamoDbProductRepository implements ProductRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly tableName: string) {}

  async findById(id: string): Promise<Product | null> {
    const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: productKey(id) } }));
    return toProduct(result.Item);
  }
  async findByCode(code: string): Promise<Product | null> {
    const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: codeKey(code) } }));
    const id = result.Item?.['productId'];
    return typeof id === 'string' ? this.findById(id) : null;
  }
  async findPresentationById(productId: string, id: string): Promise<ProductPresentation | null> {
    const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: presentationKey(id) } }));
    const item = toPresentation(result.Item);
    return item?.productId === productId ? item : null;
  }
  async findPresentationBySku(sku: string): Promise<ProductPresentation | null> {
    return this.presentationFromLock(skuKey(sku));
  }
  async findPresentationByBarcode(barcode: string): Promise<ProductPresentation | null> {
    return this.presentationFromLock(barcodeKey(barcode));
  }
  private async presentationFromLock(pk: string): Promise<ProductPresentation | null> {
    const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk } }));
    const id = result.Item?.['presentationId'];
    if (typeof id !== 'string') return null;
    const found = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: presentationKey(id) } }));
    return toPresentation(found.Item);
  }
  async listPresentations(productId: string): Promise<readonly ProductPresentation[]> {
    const result = await this.client.send(new ScanCommand({
      TableName: this.tableName, Limit: 100,
      FilterExpression: '#type = :type AND #productId = :productId',
      ExpressionAttributeNames: { '#type': 'entityType', '#productId': 'productId' },
      ExpressionAttributeValues: { ':type': presentationType, ':productId': productId }
    }));
    return (result.Items ?? []).map(toPresentation)
      .filter((item): item is ProductPresentation => item !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  async list(options: ProductListOptions): Promise<ProductPage> {
    const names: Record<string, string> = { '#type': 'entityType' };
    const values: Record<string, unknown> = { ':type': productType };
    const filters = ['#type = :type'];
    if (options.status) {
      names['#status'] = 'status'; values[':status'] = options.status;
      filters.push('#status = :status');
    }
    if (options.categoryId) {
      names['#categoryId'] = 'categoryId'; values[':categoryId'] = options.categoryId;
      filters.push('#categoryId = :categoryId');
    }
    if (options.search) {
      const presentationProductIds = await this.findProductIdsByPresentationSearch(options.search);
      names['#codeSearch'] = 'normalizedCode'; names['#nameSearch'] = 'normalizedName';
      values[':search'] = options.search;
      const clauses = ['contains(#codeSearch, :search)', 'contains(#nameSearch, :search)'];
      presentationProductIds.forEach((id, index) => {
        names[`#id${index}`] = 'id'; values[`:id${index}`] = id; clauses.push(`#id${index} = :id${index}`);
      });
      filters.push(`(${clauses.join(' OR ')})`);
    }
    const result = await this.client.send(new ScanCommand({
      TableName: this.tableName, Limit: options.limit,
      FilterExpression: filters.join(' AND '), ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...(options.nextToken ? { ExclusiveStartKey: decodeToken(options.nextToken) } : {})
    }));
    return {
      items: (result.Items ?? []).map(toProduct).filter((item): item is Product => item !== null),
      ...(result.LastEvaluatedKey ? { nextToken: encodeToken(result.LastEvaluatedKey as Record<string, unknown>) } : {})
    };
  }
  private async findProductIdsByPresentationSearch(search: string): Promise<readonly string[]> {
    const result = await this.client.send(new ScanCommand({
      TableName: this.tableName, Limit: 100,
      FilterExpression: '#type = :type AND (contains(#sku, :search) OR contains(#barcode, :search))',
      ExpressionAttributeNames: { '#type': 'entityType', '#sku': 'normalizedSku', '#barcode': 'normalizedBarcode' },
      ExpressionAttributeValues: { ':type': presentationType, ':search': search },
      ProjectionExpression: 'productId'
    }));
    return [...new Set((result.Items ?? []).map((item) => item['productId']).filter((id): id is string => typeof id === 'string'))].slice(0, 20);
  }
  async create(product: Product, presentations: readonly ProductPresentation[]): Promise<void> {
    return this.createProduct(product, presentations);
  }
  async presentationsForProducts(ids: readonly string[]): Promise<readonly ProductPresentation[]> {
    if (!ids.length) return [];
    const items: ProductPresentation[] = [];
    let key: Record<string, unknown> | undefined;
    const values: Record<string, unknown> = { ':type': presentationType };
    const placeholders = [...new Set(ids)].map((id, index) => { values[`:id${index}`] = id; return `:id${index}`; });
    do {
      const page = await this.client.send(new ScanCommand({
        TableName: this.tableName, Limit: 100,
        FilterExpression: '#type = :type AND productId IN (' + placeholders.join(',') + ')',
        ExpressionAttributeNames: { '#type': 'entityType' }, ExpressionAttributeValues: values,
        ...(key ? { ExclusiveStartKey: key } : {})
      }));
      items.push(...(page.Items ?? []).map(toPresentation).filter((item): item is ProductPresentation => item !== null));
      key = page.LastEvaluatedKey;
    } while (key);
    return items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  private async createProduct(product: Product, presentations: readonly ProductPresentation[]): Promise<void> {
    const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      putUnique(toProductItem(product)), putUnique(lockItem(codeKey(product.code), 'PRODUCT_CODE', { productId: product.id })),
      putUnique(lockItem(nameKey(product.normalizedName), 'PRODUCT_NAME', { productId: product.id }))
    ];
    presentations.forEach((item) => {
      items.push(putUnique(toPresentationItem(item)));
      if (item.sku) items.push(putUnique(lockItem(skuKey(item.sku), 'PRESENTATION_SKU', { presentationId: item.id })));
      if (item.barcode) items.push(putUnique(lockItem(barcodeKey(item.barcode), 'PRESENTATION_BARCODE', { presentationId: item.id })));
    });
    try { await this.client.send(new TransactWriteCommand({ TransactItems: withTable(items, this.tableName) })); }
    catch (error: unknown) { this.rethrowTransaction(error, 'code'); }
  }
  async updateProduct(product: Product, previousNormalizedName: string): Promise<void> {
    if (product.normalizedName === previousNormalizedName) {
      await this.client.send(new PutCommand({
        TableName: this.tableName, Item: toProductItem(product), ConditionExpression: 'attribute_exists(pk)'
      }));
      return;
    }
    const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      putExisting(toProductItem(product)),
      putUnique(lockItem(nameKey(product.normalizedName), 'PRODUCT_NAME', { productId: product.id })),
      deleteItem(nameKey(previousNormalizedName))
    ];
    try { await this.client.send(new TransactWriteCommand({ TransactItems: withTable(items, this.tableName) })); }
    catch (error: unknown) {
      if (error instanceof TransactionCanceledException) throw new ProductUniquenessError('name');
      throw error;
    }
  }
  async createPresentation(item: ProductPresentation, previousDefault?: ProductPresentation): Promise<void> {
    const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [putUnique(toPresentationItem(item))];
    if (item.sku) items.push(putUnique(lockItem(skuKey(item.sku), 'PRESENTATION_SKU', { presentationId: item.id })));
    if (item.barcode) items.push(putUnique(lockItem(barcodeKey(item.barcode), 'PRESENTATION_BARCODE', { presentationId: item.id })));
    if (previousDefault) items.push(putExisting(toPresentationItem(previousDefault)));
    try { await this.client.send(new TransactWriteCommand({ TransactItems: withTable(items, this.tableName) })); }
    catch (error: unknown) { this.rethrowTransaction(error, item.sku ? 'sku' : 'barcode'); }
  }
  async updatePresentation(
    item: ProductPresentation,
    previous: ProductPresentation,
    previousDefault?: ProductPresentation
  ): Promise<void> {
    const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [putExisting(toPresentationItem(item))];
    if (item.sku !== previous.sku) {
      if (item.sku) items.push(putUnique(lockItem(skuKey(item.sku), 'PRESENTATION_SKU', { presentationId: item.id })));
      if (previous.sku) items.push(deleteItem(skuKey(previous.sku)));
    }
    if (item.barcode !== previous.barcode) {
      if (item.barcode) items.push(putUnique(lockItem(barcodeKey(item.barcode), 'PRESENTATION_BARCODE', { presentationId: item.id })));
      if (previous.barcode) items.push(deleteItem(barcodeKey(previous.barcode)));
    }
    if (previousDefault && previousDefault.id !== item.id) items.push(putExisting(toPresentationItem(previousDefault)));
    try { await this.client.send(new TransactWriteCommand({ TransactItems: withTable(items, this.tableName) })); }
    catch (error: unknown) { this.rethrowTransaction(error, item.sku !== previous.sku ? 'sku' : 'barcode'); }
  }
  private rethrowTransaction(error: unknown, field: 'code' | 'sku' | 'barcode'): never {
    if (error instanceof TransactionCanceledException) throw new ProductUniquenessError(field);
    throw error;
  }
}

function productKey(id: string): string { return `PRODUCT#${id}`; }
function presentationKey(id: string): string { return `PRESENTATION#${id}`; }
function codeKey(code: string): string { return `PRODUCT_CODE#${code}`; }
function nameKey(name: string): string { return `PRODUCT_NAME#${name}`; }
function skuKey(sku: string): string { return `SKU#${sku}`; }
function barcodeKey(barcode: string): string { return `BARCODE#${barcode}`; }
function toProductItem(item: Product): Record<string, unknown> {
  return { pk: productKey(item.id), entityType: productType, normalizedCode: item.code.toLocaleLowerCase('es'), ...item };
}
function toPresentationItem(item: ProductPresentation): Record<string, unknown> {
  return {
    pk: presentationKey(item.id), entityType: presentationType,
    normalizedSku: item.sku?.toLocaleLowerCase('es') ?? '',
    normalizedBarcode: item.barcode?.toLocaleLowerCase('es') ?? '', ...item
  };
}
function lockItem(pk: string, entityType: string, rest: Record<string, unknown>): Record<string, unknown> {
  return { pk, entityType, ...rest };
}
function putUnique(Item: Record<string, unknown>) {
  return { Put: { TableName: '', Item, ConditionExpression: 'attribute_not_exists(pk)' } };
}
function putExisting(Item: Record<string, unknown>) {
  return { Put: { TableName: '', Item, ConditionExpression: 'attribute_exists(pk)' } };
}
function deleteItem(pk: string) { return { Delete: { TableName: '', Key: { pk } } }; }
function withTable(
  items: NonNullable<TransactWriteCommandInput['TransactItems']>,
  tableName: string
): NonNullable<TransactWriteCommandInput['TransactItems']> {
  return items.map((item) => {
    if (item.Put) return { Put: { ...item.Put, TableName: tableName } };
    if (item.Delete) return { Delete: { ...item.Delete, TableName: tableName } };
    return item;
  });
}
function toProduct(item: Record<string, unknown> | undefined): Product | null {
  if (!item || item['entityType'] !== productType) return null;
  const { pk: _pk, entityType: _type, normalizedCode: _normalizedCode, ...value } = item;
  void _pk; void _type; void _normalizedCode; return value as unknown as Product;
}
function toPresentation(item: Record<string, unknown> | undefined): ProductPresentation | null {
  if (!item || item['entityType'] !== presentationType) return null;
  const {
    pk: _pk, entityType: _type, normalizedSku: _normalizedSku,
    normalizedBarcode: _normalizedBarcode, ...value
  } = item;
  void _pk; void _type; void _normalizedSku; void _normalizedBarcode;
  return value as unknown as ProductPresentation;
}
function encodeToken(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}
function decodeToken(token: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as Record<string, unknown>)['pk'] !== 'string') throw new Error();
    return value as Record<string, unknown>;
  } catch { throw Object.assign(new Error('Cursor inválido'), { statusCode: 400 }); }
}
