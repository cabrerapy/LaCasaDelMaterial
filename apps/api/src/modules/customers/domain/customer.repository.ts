import type { CustomerStatus, CustomerType } from '@lcm/contracts';
import type { Customer } from './customer.js';
export interface CustomerListOptions { readonly limit: number; readonly nextToken?: string; readonly search?: string; readonly searchCompact?: string; readonly type?: CustomerType; readonly status?: CustomerStatus; readonly city?: string; }
export interface CustomerPage { readonly items: readonly Customer[]; readonly nextToken?: string; }
export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>; list(options: CustomerListOptions): Promise<CustomerPage>;
  create(customer: Customer): Promise<void>; update(customer: Customer, previous: Customer): Promise<void>;
}
export class CustomerUniquenessError extends Error {
  constructor(readonly field: 'document' | 'taxId') { super('Customer unique value already exists'); }
}
