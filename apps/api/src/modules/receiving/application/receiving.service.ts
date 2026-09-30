import { randomUUID } from 'node:crypto';
import type {
  CreatePurchaseReceiptRequest, PurchaseLotResponse, PurchaseLotsPageResponse, PurchaseReceiptLineInput,
  PurchaseReceiptResponse, PurchaseReceiptsPageResponse, PurchaseReceivingStatusResponse, UpdatePurchaseReceiptRequest
} from '@lcm/contracts';
import type { PurchaseRepository } from '../../purchases/domain/purchase.repository.js';
import type { Purchase, PurchaseItem } from '../../purchases/domain/purchase.js';
import type { LotListOptions, ReceiptListOptions, ReceivingRepository } from '../domain/receiving.repository.js';
import { ReceivingConflictError } from '../domain/receiving.repository.js';
import type { PurchaseLot, PurchaseReceipt, PurchaseReceiptLine } from '../domain/receiving.js';
import { ReceivingApplicationError } from './receiving-application-error.js';

export class ReceivingService {
  constructor(private readonly receipts: ReceivingRepository, private readonly purchases: PurchaseRepository) {}

  async listReceipts(options: ReceiptListOptions, costs: boolean): Promise<PurchaseReceiptsPageResponse> {
    const page = await this.receipts.listReceipts(options);
    return { items: await Promise.all(page.items.map(async (item) => this.receiptResponse(item, await this.receipts.listReceiptLines(item.id), costs))), ...(page.nextToken ? { nextToken: page.nextToken } : {}) };
  }
  async getReceipt(id: string, costs: boolean): Promise<PurchaseReceiptResponse> {
    const receipt = await this.requireReceipt(id); return this.receiptResponse(receipt, await this.receipts.listReceiptLines(id), costs);
  }
  async create(input: CreatePurchaseReceiptRequest, actor: string, costs: boolean): Promise<PurchaseReceiptResponse> {
    const purchase = await this.requirePurchase(input.purchaseId);
    if (purchase.status !== 'CONFIRMED' && purchase.status !== 'PARTIALLY_RECEIVED') throw new ReceivingApplicationError('Solo se reciben compras confirmadas o parcialmente recibidas', 409);
    const now = new Date().toISOString(); const id = randomUUID();
    const receipt: PurchaseReceipt = {
      id, receiptNumber: this.number('REC', now), purchaseId: purchase.id, purchaseNumber: purchase.purchaseNumber,
      supplierId: purchase.supplierId, supplierSnapshot: purchase.supplierSnapshot, receiptDate: input.receiptDate,
      status: 'DRAFT', ...text('deliveryDocumentNumber', input.deliveryDocumentNumber), ...text('notes', input.notes),
      createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor
    };
    const lines = await this.buildLines(receipt, input.lines, now);
    try { await this.receipts.createReceipt(receipt, lines); } catch (error: unknown) { this.rethrow(error); }
    return this.receiptResponse(receipt, lines, costs);
  }
  async update(id: string, input: UpdatePurchaseReceiptRequest, actor: string, costs: boolean): Promise<PurchaseReceiptResponse> {
    const current = await this.requireReceipt(id);
    if (current.status !== 'DRAFT') throw new ReceivingApplicationError('Solo se modifica una recepción en borrador', 409);
    const previous = await this.receipts.listReceiptLines(id); const now = new Date().toISOString();
    const receipt: PurchaseReceipt = {
      ...current, receiptDate: input.receiptDate ?? current.receiptDate,
      ...replaceText(current, 'deliveryDocumentNumber', input.deliveryDocumentNumber),
      ...replaceText(current, 'notes', input.notes), updatedAt: now, updatedBy: actor
    };
    const lines = input.lines ? await this.buildLines(receipt, input.lines, now) : previous;
    try { await this.receipts.replaceReceipt(receipt, lines, previous, 'DRAFT'); } catch (error: unknown) { this.rethrow(error); }
    return this.receiptResponse(receipt, lines, costs);
  }
  async cancel(id: string, actor: string, costs: boolean): Promise<PurchaseReceiptResponse> {
    const current = await this.requireReceipt(id);
    if (current.status !== 'DRAFT') throw new ReceivingApplicationError('Solo se cancela una recepción en borrador', 409);
    const lines = await this.receipts.listReceiptLines(id); const now = new Date().toISOString();
    const receipt: PurchaseReceipt = { ...current, status: 'CANCELLED', updatedAt: now, updatedBy: actor, cancelledAt: now, cancelledBy: actor };
    try { await this.receipts.replaceReceipt(receipt, lines, lines, 'DRAFT'); } catch (error: unknown) { this.rethrow(error); }
    return this.receiptResponse(receipt, lines, costs);
  }
  async confirm(id: string, actor: string, costs: boolean): Promise<PurchaseReceiptResponse> {
    const current = await this.requireReceipt(id);
    if (current.status !== 'DRAFT') throw new ReceivingApplicationError('La recepción ya no está en borrador', 409);
    const purchase = await this.requirePurchase(current.purchaseId);
    if (purchase.status !== 'CONFIRMED' && purchase.status !== 'PARTIALLY_RECEIVED') throw new ReceivingApplicationError('La compra no admite recepciones', 409);
    const purchaseItems = await this.purchases.listItems(purchase.id); const draftLines = await this.receipts.listReceiptLines(id);
    if (draftLines.length === 0) throw new ReceivingApplicationError('Agregue al menos una cantidad a recibir', 409);
    const now = new Date().toISOString(); const updates = new Map<string, PurchaseItem>(); const lines: PurchaseReceiptLine[] = []; const lots: PurchaseLot[] = [];
    for (const line of draftLines) {
      const original = updates.get(line.purchaseItemId) ?? purchaseItems.find((item) => item.id === line.purchaseItemId);
      if (!original) throw new ReceivingApplicationError('Una línea no pertenece a la compra', 409);
      const ordered = original.orderedQuantityBaseInternal ?? original.quantityBaseInternal;
      const received = original.receivedQuantityBaseInternal ?? 0; const allocated = original.allocatedReceivedCostGuarani ?? 0;
      const nextReceived = safeAdd(received, line.receivedQuantityBaseInternal);
      if (nextReceived > ordered) throw new ReceivingApplicationError('La cantidad recibida supera la cantidad pendiente', 409);
      const directCost = nextReceived === ordered ? original.lineSubtotalGuarani - allocated
        : Number((BigInt(original.lineSubtotalGuarani) * BigInt(line.receivedQuantityBaseInternal)) / BigInt(ordered));
      const finalized = { ...line, directPurchaseCostGuarani: directCost, updatedAt: now }; lines.push(finalized);
      const updated = { ...original, orderedQuantityBaseInternal: ordered, receivedQuantityBaseInternal: nextReceived, allocatedReceivedCostGuarani: safeAdd(allocated, directCost), updatedAt: now };
      updates.set(original.id, updated);
      lots.push({
        id: randomUUID(), lotNumber: this.number('LOT', now), purchaseId: purchase.id, purchaseNumber: purchase.purchaseNumber,
        purchaseItemId: original.id, receiptId: current.id, receiptNumber: current.receiptNumber, receiptLineId: line.id,
        supplierId: purchase.supplierId, productId: original.productId, presentationId: original.presentationId,
        receivedQuantityBaseInternal: line.receivedQuantityBaseInternal, directPurchaseCostGuarani: directCost,
        productSnapshot: original.productSnapshot, presentationSnapshot: original.presentationSnapshot,
        supplierSnapshot: purchase.supplierSnapshot, receivedAt: current.receiptDate, createdAt: now, createdBy: actor
      });
    }
    const items = purchaseItems.map((item) => updates.get(item.id) ?? item);
    const complete = items.every((item) => (item.receivedQuantityBaseInternal ?? 0) === (item.orderedQuantityBaseInternal ?? item.quantityBaseInternal));
    const nextPurchase: Purchase = { ...purchase, status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED', updatedAt: now, updatedBy: actor };
    const receipt: PurchaseReceipt = { ...current, status: 'CONFIRMED', updatedAt: now, updatedBy: actor, confirmedAt: now, confirmedBy: actor };
    try { await this.receipts.confirmReceipt(receipt, lines, lots, nextPurchase, items); } catch (error: unknown) { this.rethrow(error); }
    return this.receiptResponse(receipt, lines, costs);
  }
  async receivingStatus(purchaseId: string): Promise<PurchaseReceivingStatusResponse> {
    const purchase = await this.requirePurchase(purchaseId); const items = await this.purchases.listItems(purchaseId);
    return { purchaseId, purchaseNumber: purchase.purchaseNumber, status: purchase.status, items: items.map((item) => {
      const ordered = item.orderedQuantityBaseInternal ?? item.quantityBaseInternal; const received = item.receivedQuantityBaseInternal ?? 0;
      return { purchaseItemId: item.id, productId: item.productId, presentationId: item.presentationId, productSnapshot: item.productSnapshot,
        presentationSnapshot: item.presentationSnapshot, orderedQuantityBaseInternal: ordered, receivedQuantityBaseInternal: received,
        pendingQuantityBaseInternal: ordered - received, orderedQuantity: decimal(ordered, item.productSnapshot.quantityScale),
        receivedQuantity: decimal(received, item.productSnapshot.quantityScale), pendingQuantity: decimal(ordered - received, item.productSnapshot.quantityScale) };
    }) };
  }
  async listLots(options: LotListOptions, costs: boolean): Promise<PurchaseLotsPageResponse> {
    const page = await this.receipts.listLots(options); return { items: page.items.map((lot) => this.lotResponse(lot, costs)), ...(page.nextToken ? { nextToken: page.nextToken } : {}) };
  }
  async getLot(id: string, costs: boolean): Promise<PurchaseLotResponse> {
    const lot = await this.receipts.findLotById(id); if (!lot) throw new ReceivingApplicationError('Lote no encontrado', 404); return this.lotResponse(lot, costs);
  }
  private async buildLines(receipt: PurchaseReceipt, inputs: readonly PurchaseReceiptLineInput[], now: string): Promise<PurchaseReceiptLine[]> {
    if (inputs.length === 0 || inputs.length > 5) throw new ReceivingApplicationError('Una recepción admite entre 1 y 5 líneas', 400);
    const items = await this.purchases.listItems(receipt.purchaseId); const seen = new Set<string>();
    return inputs.map((input) => {
      const item = items.find((candidate) => candidate.id === input.purchaseItemId);
      if (!item || seen.has(item.id)) throw new ReceivingApplicationError('Cada línea debe pertenecer una sola vez a la compra', 400); seen.add(item.id);
      const quantity = decimalTimes(input.receivedQuantity, item.presentationSnapshot.baseQuantityInternal);
      return { id: randomUUID(), receiptId: receipt.id, purchaseId: receipt.purchaseId, purchaseItemId: item.id,
        productId: item.productId, presentationId: item.presentationId, receivedQuantityBaseInternal: quantity,
        directPurchaseCostGuarani: 0, productSnapshot: item.productSnapshot, presentationSnapshot: item.presentationSnapshot,
        ...text('notes', input.notes), createdAt: now, updatedAt: now };
    });
  }
  private async requireReceipt(id: string): Promise<PurchaseReceipt> { const value = await this.receipts.findReceiptById(id); if (!value) throw new ReceivingApplicationError('Recepción no encontrada', 404); return value; }
  private async requirePurchase(id: string): Promise<Purchase> { const value = await this.purchases.findById(id); if (!value) throw new ReceivingApplicationError('Compra no encontrada', 404); return value; }
  private receiptResponse(value: PurchaseReceipt, lines: readonly PurchaseReceiptLine[], costs: boolean): PurchaseReceiptResponse {
    return { ...value, lines: lines.map((line) => ({ id: line.id, receiptId: line.receiptId, purchaseId: line.purchaseId, purchaseItemId: line.purchaseItemId,
      productId: line.productId, presentationId: line.presentationId, receivedQuantityBaseInternal: line.receivedQuantityBaseInternal,
      receivedQuantity: decimal(line.receivedQuantityBaseInternal, line.productSnapshot.quantityScale), ...(costs ? { directPurchaseCostGuarani: line.directPurchaseCostGuarani } : {}),
      productSnapshot: line.productSnapshot, presentationSnapshot: line.presentationSnapshot, ...(line.notes ? { notes: line.notes } : {}) })) };
  }
  private lotResponse(lot: PurchaseLot, costs: boolean): PurchaseLotResponse { return { ...lot, receivedQuantity: decimal(lot.receivedQuantityBaseInternal, lot.productSnapshot.quantityScale), ...(costs ? { directPurchaseCostGuarani: lot.directPurchaseCostGuarani } : { directPurchaseCostGuarani: undefined }) }; }
  private number(prefix: string, now: string): string { return `${prefix}-${now.slice(0, 4)}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`; }
  private rethrow(error: unknown): never { if (error instanceof ReceivingConflictError) throw new ReceivingApplicationError('Los datos cambiaron; recarga e intenta nuevamente', 409); throw error; }
}
function decimalTimes(value: string, multiplier: number): number {
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(value.trim()); if (!match || !Number.isSafeInteger(multiplier) || multiplier <= 0) throw new ReceivingApplicationError('Cantidad inválida', 400);
  const fraction = match[2] ?? ''; const denominator = 10n ** BigInt(fraction.length); const numerator = BigInt(match[1] ?? '0') * denominator + BigInt(fraction || '0');
  const scaled = numerator * BigInt(multiplier); if (numerator <= 0n || scaled % denominator !== 0n) throw new ReceivingApplicationError('La cantidad no puede representarse exactamente', 400);
  const result = Number(scaled / denominator); if (!Number.isSafeInteger(result)) throw new ReceivingApplicationError('Cantidad fuera de rango', 400); return result;
}
function decimal(value: number, scale: number): string { const whole = Math.trunc(value / scale); const remainder = value % scale; if (!remainder) return String(whole); const digits = String(scale).length - 1; return `${whole}.${String(remainder).padStart(digits, '0').replace(/0+$/, '')}`; }
function safeAdd(a: number, b: number): number { const value = a + b; if (!Number.isSafeInteger(value)) throw new ReceivingApplicationError('Valor fuera de rango', 400); return value; }
function text<K extends 'deliveryDocumentNumber' | 'notes'>(key: K, value: string | undefined): Partial<Record<K, string>> { const normalized = value?.trim(); return normalized ? { [key]: normalized } as Partial<Record<K, string>> : {}; }
function replaceText<T extends object, K extends 'deliveryDocumentNumber' | 'notes'>(current: T, key: K, value: string | undefined): Partial<Record<K, string>> { return value === undefined ? (key in current ? { [key]: String((current as Record<string, unknown>)[key]) } as Partial<Record<K, string>> : {}) : text(key, value); }
