import type { SupplierStatus } from '@lcm/contracts';
import type { Supplier } from './supplier.js';

export interface SupplierListOptions {
  readonly limit: number;
  readonly nextToken?: string;
  readonly search?: string;
  readonly status?: SupplierStatus;
}
export interface SupplierPage { readonly items: readonly Supplier[]; readonly nextToken?: string; }
export interface SupplierRepository {
  findById(id: string): Promise<Supplier | null>;
  findByTaxId(taxId: string): Promise<Supplier | null>;
  list(options: SupplierListOptions): Promise<SupplierPage>;
  create(supplier: Supplier): Promise<void>;
  update(supplier: Supplier, previousTaxId?: string): Promise<void>;
}
export class SupplierTaxIdUniquenessError extends Error {
  constructor() { super('Supplier taxId already exists'); this.name = 'SupplierTaxIdUniquenessError'; }
}
