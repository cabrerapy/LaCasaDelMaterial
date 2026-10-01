import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import type {
  CategoryListOptions,
  CategoryPage,
  CategoryRepository
} from '../domain/category.repository.js';
import { CategoryUniquenessError } from '../domain/category.repository.js';
import type { ProductCategory } from '../domain/product-category.js';

const entityType = 'CATEGORY';

export class DynamoDbCategoryRepository implements CategoryRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async findById(id: string): Promise<ProductCategory | null> {
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: categoryKey(id) }
    }));
    return toCategory(result.Item);
  }

  async findBySlug(slug: string): Promise<ProductCategory | null> {
    return this.findSlug(slug);
  }
  async findByIds(ids: readonly string[]): Promise<readonly ProductCategory[]> {
    return (await batchRead(this.client, this.tableName, ids.map(categoryKey))).map(toCategory).filter((item): item is ProductCategory => item !== null);
  }
  private async findSlug(slug: string): Promise<ProductCategory | null> {
    const lock = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { pk: slugKey(slug) }
    }));
    const categoryId = lock.Item?.['categoryId'];
    return typeof categoryId === 'string' ? this.findById(categoryId) : null;
  }

  async list(options: CategoryListOptions): Promise<CategoryPage> {
    const names: Record<string, string> = { '#entityType': 'entityType' };
    const values: Record<string, unknown> = { ':entityType': entityType };
    const filters = ['#entityType = :entityType'];
    if (options.status) {
      names['#status'] = 'status';
      values[':status'] = options.status;
      filters.push('#status = :status');
    }
    if (options.search) {
      names['#normalizedName'] = 'normalizedName';
      values[':search'] = options.search;
      filters.push('contains(#normalizedName, :search)');
    }
    const result = await this.client.send(new ScanCommand({
      TableName: this.tableName,
      Limit: options.limit,
      FilterExpression: filters.join(' AND '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...(options.nextToken ? { ExclusiveStartKey: decodeToken(options.nextToken) } : {})
    }));
    const items = (result.Items ?? [])
      .map(toCategory)
      .filter((category): category is ProductCategory => category !== null)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    return {
      items,
      ...(result.LastEvaluatedKey
        ? { nextToken: encodeToken(result.LastEvaluatedKey as Record<string, unknown>) }
        : {})
    };
  }

  async create(category: ProductCategory): Promise<void> {
    try {
      await this.client.send(new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: toItem(category),
              ConditionExpression: 'attribute_not_exists(pk)'
            }
          },
          {
            Put: {
              TableName: this.tableName,
              Item: { pk: slugKey(category.slug), entityType: 'CATEGORY_SLUG', categoryId: category.id },
              ConditionExpression: 'attribute_not_exists(pk)'
            }
          }
        ]
      }));
    } catch (error: unknown) {
      if (error instanceof TransactionCanceledException) throw new CategoryUniquenessError();
      throw error;
    }
  }

  async update(category: ProductCategory, previousSlug: string): Promise<void> {
    if (category.slug === previousSlug) {
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: toItem(category),
        ConditionExpression: 'attribute_exists(pk)'
      }));
      return;
    }
    try {
      await this.client.send(new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: toItem(category),
              ConditionExpression: 'attribute_exists(pk)'
            }
          },
          {
            Put: {
              TableName: this.tableName,
              Item: { pk: slugKey(category.slug), entityType: 'CATEGORY_SLUG', categoryId: category.id },
              ConditionExpression: 'attribute_not_exists(pk)'
            }
          },
          {
            Delete: {
              TableName: this.tableName,
              Key: { pk: slugKey(previousSlug) },
              ConditionExpression: 'attribute_exists(pk)'
            }
          }
        ]
      }));
    } catch (error: unknown) {
      if (error instanceof TransactionCanceledException) throw new CategoryUniquenessError();
      throw error;
    }
  }
}

function categoryKey(id: string): string { return `CATEGORY#${id}`; }
function slugKey(slug: string): string { return `SLUG#${slug}`; }
function toItem(category: ProductCategory): Record<string, unknown> {
  return { pk: categoryKey(category.id), entityType, ...category };
}
function toCategory(item: Record<string, unknown> | undefined): ProductCategory | null {
  if (!item || item['entityType'] !== entityType) return null;
  const { pk: _pk, entityType: _entityType, ...category } = item;
  void _pk;
  void _entityType;
  return category as unknown as ProductCategory;
}
function encodeToken(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}
function decodeToken(token: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('Invalid pagination token');
  }
}
import { batchRead } from '../../../infrastructure/dynamodb/batch-read.js';
