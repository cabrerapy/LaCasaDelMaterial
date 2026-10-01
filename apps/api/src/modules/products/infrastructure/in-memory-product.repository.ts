import type { ProductListOptions, ProductPage, ProductRepository } from '../domain/product.repository.js';
import { ProductUniquenessError } from '../domain/product.repository.js';
import type { Product, ProductPresentation } from '../domain/product.js';

export class InMemoryProductRepository implements ProductRepository {
  private readonly products = new Map<string, Product>();
  private readonly presentations = new Map<string, ProductPresentation>();

  async findById(id: string): Promise<Product | null> { return this.products.get(id) ?? null; }
  async findByCode(code: string): Promise<Product | null> {
    return [...this.products.values()].find((item) => item.code === code) ?? null;
  }
  async findPresentationById(productId: string, id: string): Promise<ProductPresentation | null> {
    const item = this.presentations.get(id);
    return item?.productId === productId ? item : null;
  }
  async findPresentationBySku(sku: string): Promise<ProductPresentation | null> {
    return [...this.presentations.values()].find((item) => item.sku === sku) ?? null;
  }
  async findPresentationByBarcode(barcode: string): Promise<ProductPresentation | null> {
    return [...this.presentations.values()].find((item) => item.barcode === barcode) ?? null;
  }
  async listPresentations(productId: string): Promise<readonly ProductPresentation[]> {
    return [...this.presentations.values()]
      .filter((item) => item.productId === productId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  }
  async presentationsForProducts(ids: readonly string[]) {
    return [...this.presentations.values()].filter((item) => ids.includes(item.productId)).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async list(options: ProductListOptions): Promise<ProductPage> {
    const start = options.nextToken ? Number(options.nextToken) : 0;
    if (!Number.isSafeInteger(start) || start < 0) throw Object.assign(new Error('Cursor inválido'), { statusCode: 400 });
    const search = options.search?.toLocaleLowerCase('es');
    const matches = async (product: Product): Promise<boolean> => {
      if (!search) return true;
      if (product.code.toLocaleLowerCase('es').includes(search) || product.normalizedName.includes(search)) return true;
      return (await this.listPresentations(product.id)).some((item) =>
        item.sku?.toLocaleLowerCase('es').includes(search) || item.barcode?.includes(search));
    };
    const filtered: Product[] = [];
    for (const product of [...this.products.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      if (options.status && product.status !== options.status) continue;
      if (options.categoryId && product.categoryId !== options.categoryId) continue;
      if (await matches(product)) filtered.push(product);
    }
    const items = filtered.slice(start, start + options.limit);
    const end = start + items.length;
    return { items, ...(end < filtered.length ? { nextToken: String(end) } : {}) };
  }
  async create(product: Product, presentations: readonly ProductPresentation[]): Promise<void> {
    if (await this.findByCode(product.code)) throw new ProductUniquenessError('code');
    if ([...this.products.values()].some((item) => item.normalizedName === product.normalizedName)) {
      throw new ProductUniquenessError('name');
    }
    this.assertPresentationUniqueness(presentations);
    this.products.set(product.id, product);
    presentations.forEach((item) => this.presentations.set(item.id, item));
  }
  async updateProduct(product: Product, previousNormalizedName: string): Promise<void> {
    if (!this.products.has(product.id)) throw new Error('Product not found');
    if (product.normalizedName !== previousNormalizedName && [...this.products.values()].some(
      (item) => item.id !== product.id && item.normalizedName === product.normalizedName
    )) throw new ProductUniquenessError('name');
    this.products.set(product.id, product);
  }
  async createPresentation(item: ProductPresentation, previousDefault?: ProductPresentation): Promise<void> {
    this.assertPresentationUniqueness([item]);
    if (previousDefault) this.presentations.set(previousDefault.id, previousDefault);
    this.presentations.set(item.id, item);
  }
  async updatePresentation(
    item: ProductPresentation,
    previous: ProductPresentation,
    previousDefault?: ProductPresentation
  ): Promise<void> {
    this.assertPresentationUniqueness([item], previous.id);
    if (previousDefault) this.presentations.set(previousDefault.id, previousDefault);
    this.presentations.set(item.id, item);
  }
  private assertPresentationUniqueness(items: readonly ProductPresentation[], currentId?: string): void {
    const skus = new Set<string>();
    const barcodes = new Set<string>();
    for (const item of items) {
      if (item.sku) {
        if (skus.has(item.sku)) throw new ProductUniquenessError('sku');
        skus.add(item.sku);
        const existing = [...this.presentations.values()].find((value) => value.sku === item.sku);
        if (existing && existing.id !== currentId) throw new ProductUniquenessError('sku');
      }
      if (item.barcode) {
        if (barcodes.has(item.barcode)) throw new ProductUniquenessError('barcode');
        barcodes.add(item.barcode);
        const existing = [...this.presentations.values()].find((value) => value.barcode === item.barcode);
        if (existing && existing.id !== currentId) throw new ProductUniquenessError('barcode');
      }
    }
  }
}
