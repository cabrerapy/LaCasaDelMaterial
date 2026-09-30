import type {
  PresentationSnapshot, ProductSnapshot, PurchaseStatus, SupplierSnapshot
} from '@lcm/contracts';

export interface Purchase {
  readonly id: string;
  readonly purchaseNumber: string;
  readonly supplierId: string;
  readonly supplierSnapshot: SupplierSnapshot;
  readonly supplierInvoiceNumber?: string;
  readonly normalizedSupplierInvoiceNumber?: string;
  readonly purchaseDate: string;
  readonly expectedDeliveryDate?: string;
  readonly status: PurchaseStatus;
  readonly notes?: string;
  readonly cancellationReason?: string;
  readonly subtotalGuarani: number;
  readonly discountGuarani: number;
  readonly additionalCostsGuarani: number;
  readonly totalGuarani: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt?: string;
  readonly cancelledAt?: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly confirmedBy?: string;
  readonly cancelledBy?: string;
}

export interface PurchaseItem {
  readonly id: string;
  readonly purchaseId: string;
  readonly productId: string;
  readonly presentationId: string;
  readonly productSnapshot: ProductSnapshot;
  readonly presentationSnapshot: PresentationSnapshot;
  readonly quantity: number;
  readonly quantityBaseInternal: number;
  readonly orderedQuantityBaseInternal: number;
  readonly receivedQuantityBaseInternal: number;
  readonly allocatedReceivedCostGuarani: number;
  readonly unitPurchasePriceGuarani: number;
  readonly lineSubtotalGuarani: number;
  readonly notes?: string;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
