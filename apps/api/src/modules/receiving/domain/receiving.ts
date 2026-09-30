import type { PresentationSnapshot, ProductSnapshot, PurchaseReceiptStatus, SupplierSnapshot } from '@lcm/contracts';

export interface PurchaseReceipt {
  readonly id: string; readonly receiptNumber: string; readonly purchaseId: string; readonly purchaseNumber: string;
  readonly supplierId: string; readonly supplierSnapshot: SupplierSnapshot; readonly receiptDate: string;
  readonly status: PurchaseReceiptStatus; readonly deliveryDocumentNumber?: string; readonly notes?: string;
  readonly createdAt: string; readonly updatedAt: string; readonly confirmedAt?: string; readonly cancelledAt?: string;
  readonly createdBy: string; readonly updatedBy: string; readonly confirmedBy?: string; readonly cancelledBy?: string;
}
export interface PurchaseReceiptLine {
  readonly id: string; readonly receiptId: string; readonly purchaseId: string; readonly purchaseItemId: string;
  readonly productId: string; readonly presentationId: string; readonly receivedQuantityBaseInternal: number;
  readonly directPurchaseCostGuarani: number; readonly productSnapshot: ProductSnapshot;
  readonly presentationSnapshot: PresentationSnapshot; readonly notes?: string; readonly createdAt: string; readonly updatedAt: string;
}
export interface PurchaseLot {
  readonly id: string; readonly lotNumber: string; readonly purchaseId: string; readonly purchaseNumber: string;
  readonly purchaseItemId: string; readonly receiptId: string; readonly receiptNumber: string; readonly receiptLineId: string;
  readonly supplierId: string; readonly productId: string; readonly presentationId: string;
  readonly receivedQuantityBaseInternal: number; readonly directPurchaseCostGuarani: number;
  readonly productSnapshot: ProductSnapshot; readonly presentationSnapshot: PresentationSnapshot;
  readonly supplierSnapshot: SupplierSnapshot; readonly receivedAt: string; readonly createdAt: string; readonly createdBy: string;
}
