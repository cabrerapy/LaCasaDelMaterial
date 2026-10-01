import type { InventorySummary, StockFilters, StockResponse, StockDetailResponse, StockPageResponse, StockPresentation, StockStatus } from '@lcm/contracts';
import type { ProductRepository } from '../../products/domain/product.repository.js';
import type { Product, ProductPresentation } from '../../products/domain/product.js';
import type { CategoryRepository } from '../../categories/domain/category.repository.js';
import type { InventoryRepository } from '../domain/inventory.js';
import { InventoryService } from './inventory.service.js';

export function stockStatus(product: Pick<Product, 'trackStock' | 'minStockInternal'>, onHand: number): StockStatus {
  if (!product.trackStock) return 'NOT_TRACKED';
  if (onHand <= 0) return 'OUT_OF_STOCK';
  return onHand <= product.minStockInternal ? 'LOW_STOCK' : 'OK';
}
function shortage(product: Product, onHand: number): number {
  if (!product.trackStock) return 0;
  const value = Math.max(product.minStockInternal - onHand, 0);
  if (!Number.isSafeInteger(value)) throw Object.assign(new Error('Faltante fuera del rango seguro'), { statusCode: 409 });
  return value;
}
function presentation(item: ProductPresentation): StockPresentation {
  return { id: item.id, name: item.name, baseQuantityInternal: item.baseQuantityInternal, isDefault: item.isDefault,
    ...(item.sku ? { sku: item.sku } : {}), ...(item.barcode ? { barcode: item.barcode } : {}) };
}
export class StockService {
  private readonly ledger: InventoryService;
  constructor(private readonly products: ProductRepository, private readonly categories: CategoryRepository, private readonly inventory: InventoryRepository) {
    this.ledger = new InventoryService(inventory);
  }
  async list(filters: StockFilters): Promise<StockPageResponse> {
    const status = filters.productStatus ?? 'ACTIVE';
    const page = await this.products.list({ limit: filters.pageSize ?? 25,
      ...(status !== 'ALL' ? { status } : {}), ...(filters.search?.trim() ? { search: filters.search.trim().toLocaleLowerCase('es') } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}), ...(filters.nextToken ? { nextToken: filters.nextToken } : {}) });
    const balances = new Map((await this.inventory.getBalances(page.items.map((p) => p.id))).map((b) => [b.productId, b.onHandInternal]));
    const selected = page.items.filter((p) => (filters.trackStock === undefined || p.trackStock === filters.trackStock)
      && (!filters.stockStatus || stockStatus(p, balances.get(p.id) ?? 0) === filters.stockStatus));
    const items = await this.enrich(selected, balances);
    const sort = filters.sort ?? 'name';
    items.sort((a, b) => a[sort].localeCompare(b[sort], 'es') || a.productId.localeCompare(b.productId));
    return { items, ...(page.nextToken ? { nextToken: page.nextToken } : {}) };
  }
  private async enrich(products: readonly Product[], balances: ReadonlyMap<string, number>): Promise<StockResponse[]> {
    if (!products.length) return [];
    const [categories, presentations] = await Promise.all([
      this.categories.findByIds(products.map((p) => p.categoryId)), this.products.presentationsForProducts(products.map((p) => p.id))
    ]);
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const rows: StockResponse[] = [];
    // Latest history is an indexed, limit-one query, with at most five in flight.
    // No new denormalized stock fields or scans over the ledger.
    for (let offset = 0; offset < products.length; offset += 5) {
      rows.push(...await Promise.all(products.slice(offset, offset + 5).map(async (p) => {
        const onHand = balances.get(p.id) ?? 0;
        const latest = (await this.inventory.list({ productId: p.id, pageSize: 1 })).items[0];
        const defaultItem = presentations.find((item) => item.productId === p.id && item.isDefault && item.status === 'ACTIVE');
        return { productId: p.id, code: p.code, name: p.name, productStatus: p.status,
          category: { id: p.categoryId, name: names.get(p.categoryId) ?? 'Categoría no disponible' },
          baseUnit: p.baseUnit, quantityScale: p.quantityScale, trackStock: p.trackStock,
          onHandInternal: onHand, minStockInternal: p.minStockInternal, shortageInternal: shortage(p, onHand),
          stockStatus: stockStatus(p, onHand), defaultPresentation: defaultItem ? presentation(defaultItem) : null,
          lastMovementAt: latest?.occurredAt ?? null };
      })));
    }
    return rows;
  }
  async detail(id: string, movements: boolean, costs: boolean): Promise<StockDetailResponse> {
    const product = await this.requireProduct(id);
    const onHand = (await this.inventory.getBalance(id))?.onHandInternal ?? 0;
    const [row] = await this.enrich([product], new Map([[id, onHand]]));
    const presentations = (await this.products.presentationsForProducts([id])).filter((p) => p.status === 'ACTIVE').map(presentation);
    // Stock permission alone must not bypass the ledger permission.
    const recentMovements = movements ? (await this.ledger.list({ productId: id, pageSize: 10 }, costs)).items : [];
    const receipt = recentMovements.find((m) => m.type === 'PURCHASE_RECEIPT');
    return { ...row!, presentations, recentMovements,
      lastReceipt: receipt ? { id: receipt.sourceId, referenceNumber: receipt.referenceNumber, occurredAt: receipt.occurredAt } : null };
  }
  async summary(): Promise<InventorySummary> {
    const counts = { totalTrackedProducts: 0, okProducts: 0, lowStockProducts: 0, outOfStockProducts: 0, notTrackedProducts: 0 };
    let token: string | undefined;
    do {
      const page = await this.products.list({ limit: 100, status: 'ACTIVE', ...(token ? { nextToken: token } : {}) });
      const balances = new Map((await this.inventory.getBalances(page.items.map((p) => p.id))).map((b) => [b.productId, b.onHandInternal]));
      for (const p of page.items) {
        const status = stockStatus(p, balances.get(p.id) ?? 0);
        if (p.trackStock) counts.totalTrackedProducts++;
        if (status === 'OK') counts.okProducts++;
        if (status === 'LOW_STOCK') counts.lowStockProducts++;
        if (status === 'OUT_OF_STOCK') counts.outOfStockProducts++;
        if (status === 'NOT_TRACKED') counts.notTrackedProducts++;
      }
      token = page.nextToken;
    } while (token);
    return counts;
  }
  // Future: available = onHand - reserved. Null means stock is not controlled.
  async getAvailableStock(id: string): Promise<number | null> {
    const product = await this.requireProduct(id);
    return product.trackStock ? (await this.inventory.getBalance(id))?.onHandInternal ?? 0 : null;
  }
  // Advisory only: a future sale must atomically validate and decrement stock.
  async hasSufficientStock(id: string, quantityInternal: number): Promise<boolean> {
    if (!Number.isSafeInteger(quantityInternal) || quantityInternal <= 0) throw Object.assign(new Error('Cantidad inválida'), { statusCode: 400 });
    const available = await this.getAvailableStock(id);
    return available === null || available >= quantityInternal;
  }
  private async requireProduct(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (!product) throw Object.assign(new Error('Producto no encontrado'), { statusCode: 404 });
    return product;
  }
}
