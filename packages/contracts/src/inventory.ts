import type { ProductSnapshot } from './index.js';

export const INVENTORY_MOVEMENT_TYPES = ['PURCHASE_RECEIPT', 'SALE', 'SALE_VOID'] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];
// Future types require a business producer and lot-consumption rules before activation.
export interface InventoryMovementResponse {
  readonly id: string;
  readonly movementNumber: string;
  readonly productId: string;
  readonly productSnapshot: ProductSnapshot;
  readonly lotId?: string;
  readonly lotNumber?: string;
  readonly purchaseId?: string;
  readonly saleId?: string;
  readonly type: InventoryMovementType;
  readonly quantityDeltaInternal: number;
  readonly sourceType: 'PURCHASE_RECEIPT' | 'SALE' | 'SALE_VOID';
  readonly sourceId: string;
  readonly sourceLineId: string;
  readonly referenceNumber: string;
  readonly costGuarani?: number;
  readonly occurredAt: string;
  readonly notes?: string;
  readonly createdAt: string;
  readonly createdBy: string;
}
export interface InventoryMovementsPageResponse {
  readonly items: readonly InventoryMovementResponse[];
  readonly nextToken?: string;
}
export interface InventoryMovementFilters {
  readonly productId?: string;
  readonly lotId?: string;
  readonly type?: InventoryMovementType;
  readonly sourceType?: 'PURCHASE_RECEIPT' | 'SALE' | 'SALE_VOID';
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly search?: string;
  readonly nextToken?: string;
  readonly pageSize?: number;
}
