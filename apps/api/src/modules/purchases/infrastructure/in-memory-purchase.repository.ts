import type {
  PurchaseListOptions, PurchasePage, PurchaseRepository
} from '../domain/purchase.repository.js';
import { PurchaseConflictError } from '../domain/purchase.repository.js';
import type { Purchase, PurchaseItem } from '../domain/purchase.js';

export class InMemoryPurchaseRepository implements PurchaseRepository {
  private readonly purchases = new Map<string, Purchase>();
  private readonly items = new Map<string, PurchaseItem>();
  async findById(id: string): Promise<Purchase | null> { return this.purchases.get(id) ?? null; }
  async findByPurchaseNumber(number: string): Promise<Purchase | null> {
    return [...this.purchases.values()].find((item) => item.purchaseNumber === number) ?? null;
  }
  async listItems(purchaseId: string): Promise<readonly PurchaseItem[]> {
    return [...this.items.values()].filter((item) => item.purchaseId === purchaseId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async list(options: PurchaseListOptions): Promise<PurchasePage> {
    const start = options.nextToken ? Number(options.nextToken) : 0;
    const search = options.search;
    const filtered = [...this.purchases.values()]
      .filter((item) => !options.supplierId || item.supplierId === options.supplierId)
      .filter((item) => !options.status || item.status === options.status)
      .filter((item) => !options.dateFrom || item.purchaseDate >= options.dateFrom)
      .filter((item) => !options.dateTo || item.purchaseDate <= options.dateTo)
      .filter((item) => !search || item.purchaseNumber.toLocaleLowerCase('es').includes(search)
        || item.normalizedSupplierInvoiceNumber?.includes(search)
        || item.supplierSnapshot.businessName.toLocaleLowerCase('es').includes(search))
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.createdAt.localeCompare(a.createdAt));
    const items = filtered.slice(start, start + options.limit); const end = start + items.length;
    return { items, ...(end < filtered.length ? { nextToken: String(end) } : {}) };
  }
  async create(purchase: Purchase, items: readonly PurchaseItem[]): Promise<void> {
    if (await this.findByPurchaseNumber(purchase.purchaseNumber)) throw new PurchaseConflictError('Purchase number exists');
    this.purchases.set(purchase.id, purchase); items.forEach((item) => this.items.set(item.id, item));
  }
  async replace(
    purchase: Purchase, items: readonly PurchaseItem[], previousItems: readonly PurchaseItem[], expectedStatus: Purchase['status']
  ): Promise<void> {
    const current = this.purchases.get(purchase.id);
    if (!current || current.status !== expectedStatus) throw new PurchaseConflictError();
    const nextIds = new Set(items.map((item) => item.id));
    previousItems.filter((item) => !nextIds.has(item.id)).forEach((item) => this.items.delete(item.id));
    items.forEach((item) => this.items.set(item.id, item)); this.purchases.set(purchase.id, purchase);
  }
}
