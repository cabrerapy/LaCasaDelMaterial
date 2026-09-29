import type { CategoryStatus } from '@lcm/contracts';
import type { ProductCategory } from './product-category.js';

export interface CategoryListOptions {
  readonly limit: number;
  readonly nextToken?: string;
  readonly status?: CategoryStatus;
  readonly search?: string;
}

export interface CategoryPage {
  readonly items: readonly ProductCategory[];
  readonly nextToken?: string;
}

export interface CategoryRepository {
  findById(id: string): Promise<ProductCategory | null>;
  findBySlug(slug: string): Promise<ProductCategory | null>;
  list(options: CategoryListOptions): Promise<CategoryPage>;
  create(category: ProductCategory): Promise<void>;
  update(category: ProductCategory, previousSlug: string): Promise<void>;
}

export class CategoryUniquenessError extends Error {
  constructor() {
    super('Category name or slug already exists');
    this.name = 'CategoryUniquenessError';
  }
}
