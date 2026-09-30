import type { PurchaseStatus } from '@lcm/contracts';
import type { Purchase, PurchaseItem } from './purchase.js';

export interface PurchaseListOptions {
  readonly limit: number;
  readonly nextToken?: string;
  readonly search?: string;
  readonly supplierId?: string;
  readonly status?: PurchaseStatus;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}
export interface PurchasePage { readonly items: readonly Purchase[]; readonly nextToken?: string; }
export interface PurchaseRepository {
  findById(id: string): Promise<Purchase | null>;
  findByPurchaseNumber(purchaseNumber: string): Promise<Purchase | null>;
  list(options: PurchaseListOptions): Promise<PurchasePage>;
  listItems(purchaseId: string): Promise<readonly PurchaseItem[]>;
  create(purchase: Purchase, items: readonly PurchaseItem[]): Promise<void>;
  replace(
    purchase: Purchase,
    items: readonly PurchaseItem[],
    previousItems: readonly PurchaseItem[],
    expectedStatus: PurchaseStatus
  ): Promise<void>;
}
export class PurchaseConflictError extends Error {
  constructor(message = 'Purchase changed concurrently') { super(message); this.name = 'PurchaseConflictError'; }
}
