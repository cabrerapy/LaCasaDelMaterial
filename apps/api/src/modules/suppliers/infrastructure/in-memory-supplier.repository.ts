import type { SupplierListOptions, SupplierPage, SupplierRepository } from '../domain/supplier.repository.js';
import { SupplierTaxIdUniquenessError } from '../domain/supplier.repository.js';
import type { Supplier } from '../domain/supplier.js';

export class InMemorySupplierRepository implements SupplierRepository {
  private readonly suppliers = new Map<string, Supplier>();
  async findById(id: string): Promise<Supplier | null> { return this.suppliers.get(id) ?? null; }
  async findByTaxId(taxId: string): Promise<Supplier | null> {
    return [...this.suppliers.values()].find((item) => item.taxId === taxId) ?? null;
  }
  async list(options: SupplierListOptions): Promise<SupplierPage> {
    const start = options.nextToken ? Number(options.nextToken) : 0;
    const search = options.search;
    const filtered = [...this.suppliers.values()]
      .filter((item) => !options.status || item.status === options.status)
      .filter((item) => !search || item.normalizedBusinessName.includes(search)
        || item.normalizedTradeName?.includes(search) || item.taxId?.toLocaleLowerCase('es').includes(search))
      .sort((left, right) => left.businessName.localeCompare(right.businessName));
    const items = filtered.slice(start, start + options.limit);
    const end = start + items.length;
    return { items, ...(end < filtered.length ? { nextToken: String(end) } : {}) };
  }
  async create(supplier: Supplier): Promise<void> {
    if (supplier.taxId && await this.findByTaxId(supplier.taxId)) throw new SupplierTaxIdUniquenessError();
    this.suppliers.set(supplier.id, supplier);
  }
  async update(supplier: Supplier, previousTaxId?: string): Promise<void> {
    const owner = supplier.taxId ? await this.findByTaxId(supplier.taxId) : null;
    if (owner && owner.id !== supplier.id) throw new SupplierTaxIdUniquenessError();
    if (!this.suppliers.has(supplier.id)) throw new Error('Supplier not found');
    void previousTaxId;
    this.suppliers.set(supplier.id, supplier);
  }
}
