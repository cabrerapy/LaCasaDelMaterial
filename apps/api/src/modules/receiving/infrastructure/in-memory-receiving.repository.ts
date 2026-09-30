import type { PurchaseRepository } from '../../purchases/domain/purchase.repository.js';
import type { LotListOptions, LotPage, ReceiptListOptions, ReceiptPage, ReceivingRepository } from '../domain/receiving.repository.js';
import { ReceivingConflictError } from '../domain/receiving.repository.js';
import type { PurchaseLot, PurchaseReceipt, PurchaseReceiptLine } from '../domain/receiving.js';
import type { Purchase, PurchaseItem } from '../../purchases/domain/purchase.js';

export class InMemoryReceivingRepository implements ReceivingRepository {
  private readonly receipts = new Map<string, PurchaseReceipt>(); private readonly lines = new Map<string, PurchaseReceiptLine>(); private readonly lots = new Map<string, PurchaseLot>();
  constructor(private readonly purchases: PurchaseRepository) {}
  async findReceiptById(id: string): Promise<PurchaseReceipt | null> { return this.receipts.get(id) ?? null; }
  async findReceiptByNumber(number: string): Promise<PurchaseReceipt | null> { return [...this.receipts.values()].find((value) => value.receiptNumber === number) ?? null; }
  async listReceiptLines(receiptId: string): Promise<readonly PurchaseReceiptLine[]> { return [...this.lines.values()].filter((line) => line.receiptId === receiptId); }
  async listReceipts(options: ReceiptListOptions): Promise<ReceiptPage> {
    const start = Number(options.nextToken ?? 0); const search = options.search?.toLocaleLowerCase('es');
    const values = [...this.receipts.values()].filter((value) => !options.purchaseId || value.purchaseId === options.purchaseId)
      .filter((value) => !options.supplierId || value.supplierId === options.supplierId).filter((value) => !options.status || value.status === options.status)
      .filter((value) => !options.dateFrom || value.receiptDate >= options.dateFrom).filter((value) => !options.dateTo || value.receiptDate <= options.dateTo)
      .filter((value) => !search || value.receiptNumber.toLocaleLowerCase('es').includes(search) || value.purchaseNumber.toLocaleLowerCase('es').includes(search) || value.supplierSnapshot.businessName.toLocaleLowerCase('es').includes(search))
      .sort((a, b) => b.receiptDate.localeCompare(a.receiptDate) || b.createdAt.localeCompare(a.createdAt));
    const items = values.slice(start, start + options.limit); return { items, ...(start + items.length < values.length ? { nextToken: String(start + items.length) } : {}) };
  }
  async createReceipt(receipt: PurchaseReceipt, lines: readonly PurchaseReceiptLine[]): Promise<void> {
    if (await this.findReceiptByNumber(receipt.receiptNumber)) throw new ReceivingConflictError(); this.receipts.set(receipt.id, receipt); lines.forEach((line) => this.lines.set(line.id, line));
  }
  async replaceReceipt(receipt: PurchaseReceipt, lines: readonly PurchaseReceiptLine[], previous: readonly PurchaseReceiptLine[], expectedStatus: PurchaseReceipt['status']): Promise<void> {
    if (this.receipts.get(receipt.id)?.status !== expectedStatus) throw new ReceivingConflictError(); const ids = new Set(lines.map((line) => line.id)); previous.filter((line) => !ids.has(line.id)).forEach((line) => this.lines.delete(line.id)); lines.forEach((line) => this.lines.set(line.id, line)); this.receipts.set(receipt.id, receipt);
  }
  async confirmReceipt(receipt: PurchaseReceipt, lines: readonly PurchaseReceiptLine[], lots: readonly PurchaseLot[], purchase: Purchase, items: readonly PurchaseItem[]): Promise<void> {
    if (this.receipts.get(receipt.id)?.status !== 'DRAFT') throw new ReceivingConflictError(); const previousItems = await this.purchases.listItems(purchase.id); const current = await this.purchases.findById(purchase.id); if (!current) throw new ReceivingConflictError();
    await this.purchases.replace(purchase, items, previousItems, current.status); lines.forEach((line) => this.lines.set(line.id, line)); lots.forEach((lot) => this.lots.set(lot.id, lot)); this.receipts.set(receipt.id, receipt);
  }
  async findLotById(id: string): Promise<PurchaseLot | null> { return this.lots.get(id) ?? null; }
  async listLots(options: LotListOptions): Promise<LotPage> {
    const start = Number(options.nextToken ?? 0); const values = [...this.lots.values()].filter((lot) => !options.productId || lot.productId === options.productId)
      .filter((lot) => !options.supplierId || lot.supplierId === options.supplierId).filter((lot) => !options.purchaseId || lot.purchaseId === options.purchaseId)
      .filter((lot) => !options.receiptId || lot.receiptId === options.receiptId).filter((lot) => !options.dateFrom || lot.receivedAt >= options.dateFrom).filter((lot) => !options.dateTo || lot.receivedAt <= options.dateTo)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.createdAt.localeCompare(a.createdAt)); const items = values.slice(start, start + options.limit);
    return { items, ...(start + items.length < values.length ? { nextToken: String(start + items.length) } : {}) };
  }
}
