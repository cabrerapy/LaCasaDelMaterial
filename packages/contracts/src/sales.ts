import type { BaseUnit, CustomerDocumentType } from './index.js';

export const SALE_STATUSES = ['DRAFT', 'CONFIRMED', 'VOIDED'] as const;
export type SaleStatus = typeof SALE_STATUSES[number];
export const SALE_DELIVERY_TYPES = ['PICKUP', 'OWN_FLEET', 'THIRD_PARTY'] as const;
export type SaleDeliveryType = typeof SALE_DELIVERY_TYPES[number];
export const SALE_PAYMENT_METHODS = ['CASH', 'TRANSFER', 'CARD', 'CREDIT', 'OTHER'] as const;
export type SalePaymentMethod = typeof SALE_PAYMENT_METHODS[number];
export type SaleCostingStatus = 'PENDING' | 'COSTED' | 'NOT_APPLICABLE' | 'VOIDED';
export interface SaleCustomerSnapshot { readonly displayName: string; readonly documentType?: CustomerDocumentType; readonly documentNumber?: string; readonly taxId?: string; }
export interface SaleProductSnapshot { readonly code: string; readonly name: string; readonly baseUnit: BaseUnit; readonly quantityScale: number; }
export interface SalePresentationSnapshot { readonly name: string; readonly sku?: string; readonly baseQuantityInternal: number; }
export interface SaleItemInput { readonly productId: string; readonly presentationId: string; readonly quantity: string; readonly notes?: string; }
export interface SaleItemResponse extends SaleItemInput {
  readonly id: string; readonly productSnapshot: SaleProductSnapshot; readonly presentationSnapshot: SalePresentationSnapshot;
  readonly quantityBaseInternal: number; readonly unitPriceGuarani: number; readonly lineSubtotalGuarani: number; readonly sortOrder: number;
  readonly allocatedDiscountGuarani?: number; readonly netRevenueGuarani?: number; readonly directCogsGuarani?: number;
  readonly grossProfitGuarani?: number; readonly grossMarginBps?: number;
}
export interface SaleResponse {
  readonly id: string; readonly saleNumber: string; readonly status: SaleStatus; readonly saleDate: string;
  readonly cashSessionId?: string;
  readonly customerId?: string; readonly customerSnapshot?: SaleCustomerSnapshot; readonly items: readonly SaleItemResponse[];
  readonly subtotalGuarani: number; readonly discountGuarani: number; readonly freightGuarani: number; readonly totalGuarani: number;
  readonly deliveryType: SaleDeliveryType; readonly deliveryAddress?: string; readonly paymentMethod: SalePaymentMethod;
  readonly paymentReference?: string; readonly notes?: string; readonly costingStatus: SaleCostingStatus;
  readonly netMerchandiseRevenueGuarani?: number; readonly directCogsGuarani?: number;
  readonly grossProfitGuarani?: number; readonly grossMarginBps?: number; readonly costedAt?: string;
  readonly createdAt: string; readonly updatedAt: string; readonly createdBy: string; readonly updatedBy: string;
  readonly confirmedAt?: string; readonly confirmedBy?: string; readonly voidedAt?: string; readonly voidedBy?: string; readonly voidReason?: string;
}
export interface SalesPageResponse { readonly items: readonly SaleResponse[]; readonly nextToken?: string; }
export interface CreateSaleRequest {
  readonly customerId?: string; readonly saleDate: string; readonly items: readonly SaleItemInput[];
  readonly discountGuarani?: number; readonly freightGuarani?: number; readonly deliveryType: SaleDeliveryType;
  readonly deliveryAddress?: string; readonly paymentMethod: SalePaymentMethod; readonly paymentReference?: string; readonly notes?: string;
}
export type UpdateSaleRequest = Partial<CreateSaleRequest>;
export interface VoidSaleRequest { readonly reason: string; }
export interface SaleCatalogItem { readonly productId: string; readonly presentationId: string; readonly code: string; readonly name: string; readonly presentationName: string; readonly sku?: string; readonly barcode?: string; readonly unitPriceGuarani: number; readonly availableBaseInternal?: number; readonly trackStock: boolean; }
export interface SaleCatalogResponse { readonly items: readonly SaleCatalogItem[]; }
export interface SaleLotAllocationResponse {
  readonly id: string; readonly saleId: string; readonly saleItemId: string; readonly productId: string; readonly lotId: string;
  readonly lotNumber: string; readonly quantityBaseInternal: number; readonly costGuarani?: number; readonly lotReceivedAt: string;
  readonly status: 'ACTIVE' | 'REVERSED'; readonly createdAt: string; readonly reversedAt?: string;
}
export interface SaleItemCostingResponse {
  readonly saleItemId: string; readonly productName: string; readonly quantityBaseInternal: number;
  readonly netRevenueGuarani?: number; readonly directCogsGuarani?: number; readonly grossProfitGuarani?: number;
  readonly grossMarginBps?: number; readonly allocations?: readonly SaleLotAllocationResponse[];
}
export interface SaleCostingResponse { readonly saleId: string; readonly costingStatus: SaleCostingStatus; readonly items: readonly SaleItemCostingResponse[]; }
