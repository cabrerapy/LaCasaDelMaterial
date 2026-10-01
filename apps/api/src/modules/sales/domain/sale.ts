import type { SaleCostingStatus, SaleCustomerSnapshot, SaleDeliveryType, SalePaymentMethod, SalePresentationSnapshot, SaleProductSnapshot, SaleStatus } from '@lcm/contracts';
export interface SaleItem {
  readonly id: string; readonly productId: string; readonly presentationId: string;
  readonly productSnapshot: SaleProductSnapshot; readonly presentationSnapshot: SalePresentationSnapshot;
  readonly quantity: string; readonly quantityBaseInternal: number; readonly unitPriceGuarani: number;
  readonly lineSubtotalGuarani: number; readonly notes?: string; readonly sortOrder: number; readonly trackStock: boolean;
}
export interface Sale {
  readonly id: string; readonly saleNumber: string; readonly status: SaleStatus; readonly saleDate: string;
  readonly customerId?: string; readonly customerSnapshot?: SaleCustomerSnapshot; readonly items: readonly SaleItem[];
  readonly subtotalGuarani: number; readonly discountGuarani: number; readonly freightGuarani: number; readonly totalGuarani: number;
  readonly deliveryType: SaleDeliveryType; readonly deliveryAddress?: string; readonly paymentMethod: SalePaymentMethod;
  readonly paymentReference?: string; readonly notes?: string; readonly costingStatus: SaleCostingStatus;
  readonly createdAt: string; readonly updatedAt: string; readonly createdBy: string; readonly updatedBy: string;
  readonly confirmedAt?: string; readonly confirmedBy?: string; readonly voidedAt?: string; readonly voidedBy?: string; readonly voidReason?: string;
}
