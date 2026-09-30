import type { PurchaseReceiptStatus } from '@lcm/contracts';
import type { Purchase, PurchaseItem } from '../../purchases/domain/purchase.js';
import type { PurchaseLot, PurchaseReceipt, PurchaseReceiptLine } from './receiving.js';

export interface ReceiptListOptions { readonly limit: number; readonly nextToken?: string; readonly search?: string; readonly purchaseId?: string; readonly supplierId?: string; readonly status?: PurchaseReceiptStatus; readonly dateFrom?: string; readonly dateTo?: string; }
export interface LotListOptions { readonly limit: number; readonly nextToken?: string; readonly productId?: string; readonly supplierId?: string; readonly purchaseId?: string; readonly receiptId?: string; readonly dateFrom?: string; readonly dateTo?: string; }
export interface ReceiptPage { readonly items: readonly PurchaseReceipt[]; readonly nextToken?: string; }
export interface LotPage { readonly items: readonly PurchaseLot[]; readonly nextToken?: string; }
export interface ReceivingRepository {
  findReceiptById(id: string): Promise<PurchaseReceipt | null>;
  findReceiptByNumber(number: string): Promise<PurchaseReceipt | null>;
  listReceiptLines(receiptId: string): Promise<readonly PurchaseReceiptLine[]>;
  listReceipts(options: ReceiptListOptions): Promise<ReceiptPage>;
  createReceipt(receipt: PurchaseReceipt, lines: readonly PurchaseReceiptLine[]): Promise<void>;
  replaceReceipt(receipt: PurchaseReceipt, lines: readonly PurchaseReceiptLine[], previousLines: readonly PurchaseReceiptLine[], expectedStatus: PurchaseReceiptStatus): Promise<void>;
  confirmReceipt(receipt: PurchaseReceipt, lines: readonly PurchaseReceiptLine[], lots: readonly PurchaseLot[], purchase: Purchase, items: readonly PurchaseItem[]): Promise<void>;
  findLotById(id: string): Promise<PurchaseLot | null>;
  listLots(options: LotListOptions): Promise<LotPage>;
}
export class ReceivingConflictError extends Error { constructor() { super('Receiving data changed concurrently'); this.name = 'ReceivingConflictError'; } }
