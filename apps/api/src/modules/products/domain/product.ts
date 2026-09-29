import type { BaseUnit, PresentationStatus, ProductStatus } from '@lcm/contracts';

export interface Product {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly description?: string;
  readonly categoryId: string;
  readonly baseUnit: BaseUnit;
  readonly quantityScale: number;
  readonly minStockInternal: number;
  readonly trackStock: boolean;
  readonly status: ProductStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export interface ProductPresentation {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly baseQuantityInternal: number;
  readonly salePriceGuarani: number;
  readonly isDefault: boolean;
  readonly status: PresentationStatus;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export function toInternalQuantity(displayQuantity: number, quantityScale: number): number {
  if (!Number.isFinite(displayQuantity) || displayQuantity < 0) {
    throw new Error('Quantity must be a non-negative finite number');
  }
  if (!Number.isSafeInteger(quantityScale) || quantityScale <= 0) {
    throw new Error('Quantity scale must be a positive safe integer');
  }
  const scaled = displayQuantity * quantityScale;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-9) {
    throw new Error('Quantity cannot be represented with the selected scale');
  }
  return rounded;
}

export function toDisplayQuantity(internalQuantity: number, quantityScale: number): number {
  if (!Number.isSafeInteger(internalQuantity) || internalQuantity < 0) {
    throw new Error('Internal quantity must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(quantityScale) || quantityScale <= 0) {
    throw new Error('Quantity scale must be a positive safe integer');
  }
  return internalQuantity / quantityScale;
}
