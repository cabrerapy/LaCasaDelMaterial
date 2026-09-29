import type { ProductStatus } from '@lcm/contracts';
import type { Product, ProductPresentation } from './product.js';

export interface ProductListOptions {
  readonly limit: number;
  readonly nextToken?: string;
  readonly search?: string;
  readonly categoryId?: string;
  readonly status?: ProductStatus;
}

export interface ProductPage {
  readonly items: readonly Product[];
  readonly nextToken?: string;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  findByCode(code: string): Promise<Product | null>;
  list(options: ProductListOptions): Promise<ProductPage>;
  listPresentations(productId: string): Promise<readonly ProductPresentation[]>;
  findPresentationById(productId: string, id: string): Promise<ProductPresentation | null>;
  findPresentationBySku(sku: string): Promise<ProductPresentation | null>;
  findPresentationByBarcode(barcode: string): Promise<ProductPresentation | null>;
  create(product: Product, presentations: readonly ProductPresentation[]): Promise<void>;
  updateProduct(product: Product, previousNormalizedName: string): Promise<void>;
  createPresentation(presentation: ProductPresentation, previousDefault?: ProductPresentation): Promise<void>;
  updatePresentation(
    presentation: ProductPresentation,
    previous: ProductPresentation,
    previousDefault?: ProductPresentation
  ): Promise<void>;
}

export class ProductUniquenessError extends Error {
  constructor(readonly field: 'code' | 'name' | 'sku' | 'barcode') {
    super(`Product ${field} already exists`);
    this.name = 'ProductUniquenessError';
  }
}
