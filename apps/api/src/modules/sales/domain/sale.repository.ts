import type { SalePaymentMethod, SaleStatus } from '@lcm/contracts';
import type { InventoryMovement } from '../../inventory/domain/inventory.js';
import type { Sale } from './sale.js';
export interface SaleListOptions { readonly limit: number; readonly nextToken?: string; readonly search?: string; readonly status?: SaleStatus; readonly customerId?: string; readonly userId?: string; readonly paymentMethod?: SalePaymentMethod; readonly dateFrom?: string; readonly dateTo?: string; }
export interface SalePage { readonly items: readonly Sale[]; readonly nextToken?: string; }
export interface SaleRepository {
  findById(id: string): Promise<Sale | null>; list(options: SaleListOptions): Promise<SalePage>;
  create(sale: Sale): Promise<void>; replace(sale: Sale, expectedUpdatedAt: string): Promise<void>;
  confirm(sale: Sale, movements: readonly InventoryMovement[], expectedUpdatedAt: string): Promise<void>;
  void(sale: Sale, movements: readonly InventoryMovement[], expectedUpdatedAt: string): Promise<void>;
}
export class SaleConflictError extends Error { constructor(readonly reason: 'CONCURRENT' | 'STOCK' | 'NUMBER' = 'CONCURRENT') { super(reason); } }
