import type { BaseUnit, ProductStatus } from './index.js';
import type { InventoryMovementResponse } from './inventory.js';
export const STOCK_STATUSES = ['OK', 'LOW_STOCK', 'OUT_OF_STOCK', 'NOT_TRACKED'] as const;
export type StockStatus = typeof STOCK_STATUSES[number];
export interface StockFilters {
  readonly search?: string; readonly categoryId?: string;
  readonly productStatus?: ProductStatus | 'ALL'; readonly stockStatus?: StockStatus;
  readonly trackStock?: boolean; readonly sort?: 'name' | 'code' | 'stockStatus';
  readonly pageSize?: number; readonly nextToken?: string;
}
export interface StockPresentation {
  readonly id: string; readonly name: string; readonly sku?: string; readonly barcode?: string;
  readonly baseQuantityInternal: number; readonly isDefault: boolean;
}
export interface StockResponse {
  readonly productId: string; readonly code: string; readonly name: string;
  readonly productStatus: ProductStatus;
  readonly category: { readonly id: string; readonly name: string };
  readonly baseUnit: BaseUnit; readonly quantityScale: number; readonly trackStock: boolean;
  readonly onHandInternal: number; readonly minStockInternal: number; readonly shortageInternal: number;
  readonly stockStatus: StockStatus; readonly defaultPresentation: StockPresentation | null;
  readonly lastMovementAt: string | null;
}
export interface StockPageResponse { readonly items: readonly StockResponse[]; readonly nextToken?: string; }
export interface StockDetailResponse extends StockResponse {
  readonly presentations: readonly StockPresentation[];
  readonly recentMovements: readonly InventoryMovementResponse[];
  readonly lastReceipt: { readonly id: string; readonly referenceNumber: string; readonly occurredAt: string } | null;
}
export interface InventorySummary {
  readonly totalTrackedProducts: number; readonly okProducts: number; readonly lowStockProducts: number;
  readonly outOfStockProducts: number; readonly notTrackedProducts: number;
}
