import type { CustomerListOptions, CustomerPage, CustomerRepository } from '../domain/customer.repository.js';
import { CustomerUniquenessError } from '../domain/customer.repository.js';
import type { Customer } from '../domain/customer.js';
export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly values = new Map<string, Customer>();
  async findById(id: string) { return this.values.get(id) ?? null; }
  async list(options: CustomerListOptions): Promise<CustomerPage> {
    const start = options.nextToken ? Number(options.nextToken) : 0;
    if (!Number.isSafeInteger(start) || start < 0) throw Object.assign(new Error('Cursor inválido'), { statusCode: 400 });
    const items = [...this.values.values()].filter((c) => (!options.status || c.status === options.status) && (!options.type || c.type === options.type)
      && (!options.city || c.normalizedCity?.includes(options.city)) && (!options.search || c.normalizedDisplayName.includes(options.search)
        || [c.normalizedDocument, c.taxId?.toLocaleLowerCase('es'), c.normalizedPhone].some((v) => v?.includes(options.searchCompact ?? options.search!))))
      .sort((a,b) => a.normalizedDisplayName.localeCompare(b.normalizedDisplayName));
    const page = items.slice(start, start + options.limit); return { items: page, ...(start + page.length < items.length ? { nextToken: String(start + page.length) } : {}) };
  }
  async create(customer: Customer) { this.unique(customer); this.values.set(customer.id, customer); }
  async update(customer: Customer, previous: Customer) { void previous; this.unique(customer, customer.id); if (!this.values.has(customer.id)) throw new Error('Customer not found'); this.values.set(customer.id, customer); }
  private unique(value: Customer, own?: string) {
    for (const item of this.values.values()) {
      if (item.id === own) continue;
      if (value.documentType && value.normalizedDocument && item.documentType === value.documentType && item.normalizedDocument === value.normalizedDocument) throw new CustomerUniquenessError('document');
      if (value.taxId && item.taxId === value.taxId) throw new CustomerUniquenessError('taxId');
    }
  }
}
