import { randomBytes, randomUUID } from 'node:crypto';
import type {
  CancelPurchaseRequest, CreatePurchaseRequest, PresentationSnapshot, ProductSnapshot,
  PurchaseItemInput, PurchaseItemResponse, PurchaseResponse, PurchasesPageResponse,
  SupplierSnapshot, UpdatePurchaseRequest
} from '@lcm/contracts';
import type { ProductRepository } from '../../products/domain/product.repository.js';
import type { SupplierRepository } from '../../suppliers/domain/supplier.repository.js';
import type { PurchaseListOptions, PurchaseRepository } from '../domain/purchase.repository.js';
import { PurchaseConflictError } from '../domain/purchase.repository.js';
import type { Purchase, PurchaseItem } from '../domain/purchase.js';
import { PurchaseApplicationError } from './purchase-application-error.js';

export class PurchasesService {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly suppliers: SupplierRepository,
    private readonly products: ProductRepository
  ) {}

  async list(options: PurchaseListOptions, canReadCosts: boolean): Promise<PurchasesPageResponse> {
    const page = await this.purchases.list({
      ...options, ...(options.search ? { search: normalizeSearch(options.search) } : {})
    });
    const items = await Promise.all(page.items.map(async (purchase) =>
      toResponse(purchase, await this.purchases.listItems(purchase.id), canReadCosts)));
    return { items, ...(page.nextToken ? { nextToken: page.nextToken } : {}) };
  }
  async getById(id: string, canReadCosts: boolean): Promise<PurchaseResponse> {
    const purchase = await this.requirePurchase(id);
    return toResponse(purchase, await this.purchases.listItems(id), canReadCosts);
  }
  async create(input: CreatePurchaseRequest, actorId: string): Promise<PurchaseResponse> {
    const supplier = await this.requireActiveSupplier(input.supplierId);
    validateDate(input.purchaseDate, 'Fecha de compra');
    if (input.expectedDeliveryDate) validateDate(input.expectedDeliveryDate, 'Fecha esperada');
    const id = randomUUID(); const now = new Date().toISOString();
    const items = await this.buildItems(id, input.items, actorId, now);
    const totals = calculateTotals(items, input.discountGuarani ?? 0, input.additionalCostsGuarani ?? 0);
    const purchase: Purchase = {
      id, purchaseNumber: createPurchaseNumber(now), supplierId: supplier.id,
      supplierSnapshot: supplierSnapshot(supplier),
      ...optionalInvoice(input.supplierInvoiceNumber), purchaseDate: input.purchaseDate,
      ...(input.expectedDeliveryDate ? { expectedDeliveryDate: input.expectedDeliveryDate } : {}),
      status: 'DRAFT', ...optionalNotes(input.notes), ...totals,
      createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId
    };
    try { await this.purchases.create(purchase, items); }
    catch (error: unknown) { this.rethrowConflict(error); }
    return toResponse(purchase, items, true);
  }
  async update(id: string, input: UpdatePurchaseRequest, actorId: string): Promise<PurchaseResponse> {
    const current = await this.requirePurchase(id);
    if (current.status !== 'DRAFT') throw new PurchaseApplicationError('Solo se puede editar una compra en borrador', 409);
    const previousItems = await this.purchases.listItems(id);
    const supplier = await this.requireActiveSupplier(input.supplierId ?? current.supplierId);
    const purchaseDate = input.purchaseDate ?? current.purchaseDate; validateDate(purchaseDate, 'Fecha de compra');
    const expectedDeliveryDate = input.expectedDeliveryDate === undefined
      ? current.expectedDeliveryDate : cleanOptional(input.expectedDeliveryDate ?? undefined);
    if (expectedDeliveryDate) validateDate(expectedDeliveryDate, 'Fecha esperada');
    const itemInputs = input.items ?? previousItems.map(itemToInput);
    const now = new Date().toISOString();
    const items = await this.buildItems(id, itemInputs, actorId, now, previousItems);
    const totals = calculateTotals(
      items, input.discountGuarani ?? current.discountGuarani,
      input.additionalCostsGuarani ?? current.additionalCostsGuarani
    );
    const base = clearDraftOptionals(current);
    const invoice = input.supplierInvoiceNumber === undefined
      ? current.supplierInvoiceNumber : cleanOptional(input.supplierInvoiceNumber);
    const notes = input.notes === undefined ? current.notes : cleanOptional(input.notes);
    const updated: Purchase = {
      ...base, supplierId: supplier.id, supplierSnapshot: supplierSnapshot(supplier),
      ...(invoice ? optionalInvoice(invoice) : {}), purchaseDate,
      ...(expectedDeliveryDate ? { expectedDeliveryDate } : {}), ...(notes ? { notes } : {}),
      ...totals, updatedAt: now, updatedBy: actorId
    };
    await this.replace(updated, items, previousItems, 'DRAFT');
    return toResponse(updated, items, true);
  }
  async confirm(id: string, actorId: string): Promise<PurchaseResponse> {
    const current = await this.requirePurchase(id);
    if (current.status !== 'DRAFT') throw new PurchaseApplicationError('La compra debe estar en borrador', 409);
    const previousItems = await this.purchases.listItems(id);
    if (previousItems.length === 0) throw new PurchaseApplicationError('Agregue al menos un producto', 409);
    const supplier = await this.requireActiveSupplier(current.supplierId);
    const now = new Date().toISOString();
    const items = await this.buildItems(id, previousItems.map(itemToInput), actorId, now, previousItems);
    const totals = calculateTotals(items, current.discountGuarani, current.additionalCostsGuarani);
    const confirmed: Purchase = {
      ...current, supplierSnapshot: supplierSnapshot(supplier), ...totals, status: 'CONFIRMED',
      confirmedAt: now, confirmedBy: actorId, updatedAt: now, updatedBy: actorId
    };
    await this.replace(confirmed, items, previousItems, 'DRAFT');
    return toResponse(confirmed, items, true);
  }
  async cancel(id: string, input: CancelPurchaseRequest, actorId: string): Promise<PurchaseResponse> {
    const current = await this.requirePurchase(id);
    if (current.status !== 'DRAFT' && current.status !== 'CONFIRMED') {
      throw new PurchaseApplicationError('La compra no puede cancelarse en su estado actual', 409);
    }
    const items = await this.purchases.listItems(id); const now = new Date().toISOString();
    const reason = cleanOptional(input.reason);
    const cancelled: Purchase = {
      ...current, status: 'CANCELLED', ...(reason ? { cancellationReason: reason } : {}),
      cancelledAt: now, cancelledBy: actorId, updatedAt: now, updatedBy: actorId
    };
    await this.replace(cancelled, items, items, current.status);
    return toResponse(cancelled, items, true);
  }
  private async buildItems(
    purchaseId: string,
    inputs: readonly PurchaseItemInput[],
    _actorId: string,
    now: string,
    existing: readonly PurchaseItem[] = []
  ): Promise<readonly PurchaseItem[]> {
    if (inputs.length > 10) throw new PurchaseApplicationError('Una compra admite hasta 10 productos', 400);
    return Promise.all(inputs.map(async (input, index) => {
      if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
        throw new PurchaseApplicationError('La cantidad debe ser un entero mayor que cero', 400);
      }
      if (!Number.isSafeInteger(input.unitPurchasePriceGuarani) || input.unitPurchasePriceGuarani < 0) {
        throw new PurchaseApplicationError('El precio de compra debe ser un entero no negativo', 400);
      }
      const product = await this.products.findById(input.productId);
      if (!product) throw new PurchaseApplicationError('Producto no encontrado', 400);
      if (product.status !== 'ACTIVE') throw new PurchaseApplicationError('El producto debe estar activo', 409);
      const presentation = await this.products.findPresentationById(product.id, input.presentationId);
      if (!presentation) throw new PurchaseApplicationError('La presentación no pertenece al producto', 400);
      if (presentation.status !== 'ACTIVE') throw new PurchaseApplicationError('La presentación debe estar activa', 409);
      const quantityBaseInternal = safeMultiply(input.quantity, presentation.baseQuantityInternal, 'cantidad base');
      const lineSubtotalGuarani = safeMultiply(input.quantity, input.unitPurchasePriceGuarani, 'subtotal');
      const previous = existing[index];
      return {
        id: previous?.id ?? randomUUID(), purchaseId, productId: product.id, presentationId: presentation.id,
        productSnapshot: productSnapshot(product), presentationSnapshot: presentationSnapshot(presentation),
        quantity: input.quantity, quantityBaseInternal, orderedQuantityBaseInternal: quantityBaseInternal,
        receivedQuantityBaseInternal: 0, allocatedReceivedCostGuarani: 0,
        unitPurchasePriceGuarani: input.unitPurchasePriceGuarani,
        lineSubtotalGuarani, ...optionalNotes(input.notes), sortOrder: input.sortOrder ?? index * 10,
        createdAt: previous?.createdAt ?? now, updatedAt: now
      };
    }));
  }
  private async requirePurchase(id: string): Promise<Purchase> {
    const purchase = await this.purchases.findById(id);
    if (!purchase) throw new PurchaseApplicationError('Compra no encontrada', 404); return purchase;
  }
  private async requireActiveSupplier(id: string) {
    const supplier = await this.suppliers.findById(id);
    if (!supplier) throw new PurchaseApplicationError('Proveedor no encontrado', 400);
    if (supplier.status !== 'ACTIVE') throw new PurchaseApplicationError('El proveedor debe estar activo', 409);
    return supplier;
  }
  private async replace(
    purchase: Purchase, items: readonly PurchaseItem[], previous: readonly PurchaseItem[], expectedStatus: Purchase['status']
  ): Promise<void> {
    try { await this.purchases.replace(purchase, items, previous, expectedStatus); }
    catch (error: unknown) { this.rethrowConflict(error); }
  }
  private rethrowConflict(error: unknown): never {
    if (error instanceof PurchaseConflictError) throw new PurchaseApplicationError('La compra cambió; recarga e intenta nuevamente', 409);
    throw error;
  }
}

function calculateTotals(items: readonly PurchaseItem[], discount: number, additional: number) {
  if (!Number.isSafeInteger(discount) || discount < 0 || !Number.isSafeInteger(additional) || additional < 0) {
    throw new PurchaseApplicationError('Descuento y costos adicionales deben ser enteros no negativos', 400);
  }
  const subtotalGuarani = items.reduce((total, item) => safeAdd(total, item.lineSubtotalGuarani), 0);
  const totalGuarani = subtotalGuarani - discount + additional;
  if (!Number.isSafeInteger(totalGuarani) || totalGuarani < 0) {
    throw new PurchaseApplicationError('El total de la compra no puede ser negativo', 400);
  }
  return { subtotalGuarani, discountGuarani: discount, additionalCostsGuarani: additional, totalGuarani };
}
function safeMultiply(left: number, right: number, label: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new PurchaseApplicationError(`El ${label} excede el límite permitido`, 400);
  return value;
}
function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new PurchaseApplicationError('El subtotal excede el límite permitido', 400);
  return value;
}
function createPurchaseNumber(now: string): string {
  return `CMP-${now.slice(0, 4)}-${randomBytes(4).toString('hex').toUpperCase()}`;
}
function validateDate(value: string, label: string): void {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== value) {
    throw new PurchaseApplicationError(`${label} inválida`, 400);
  }
}
function normalizeSearch(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es'); }
function cleanOptional(value: string | undefined): string | undefined { const clean = value?.trim(); return clean || undefined; }
function optionalNotes(value: string | undefined): { notes?: string } { const clean = cleanOptional(value); return clean ? { notes: clean } : {}; }
function optionalInvoice(value: string | undefined): { supplierInvoiceNumber?: string; normalizedSupplierInvoiceNumber?: string } {
  const clean = cleanOptional(value); return clean ? { supplierInvoiceNumber: clean, normalizedSupplierInvoiceNumber: normalizeSearch(clean) } : {};
}
function supplierSnapshot(supplier: Awaited<ReturnType<SupplierRepository['findById']>> & {}): SupplierSnapshot {
  return {
    businessName: supplier.businessName, ...(supplier.tradeName ? { tradeName: supplier.tradeName } : {}),
    ...(supplier.taxId ? { taxId: supplier.taxId } : {})
  };
}
function productSnapshot(product: Awaited<ReturnType<ProductRepository['findById']>> & {}): ProductSnapshot {
  return { code: product.code, name: product.name, baseUnit: product.baseUnit, quantityScale: product.quantityScale };
}
function presentationSnapshot(
  presentation: Awaited<ReturnType<ProductRepository['findPresentationById']>> & {}
): PresentationSnapshot {
  return {
    name: presentation.name, ...(presentation.sku ? { sku: presentation.sku } : {}),
    baseQuantityInternal: presentation.baseQuantityInternal
  };
}
function itemToInput(item: PurchaseItem): PurchaseItemInput {
  return {
    productId: item.productId, presentationId: item.presentationId, quantity: item.quantity,
    unitPurchasePriceGuarani: item.unitPurchasePriceGuarani,
    ...(item.notes ? { notes: item.notes } : {}), sortOrder: item.sortOrder
  };
}
function clearDraftOptionals(
  purchase: Purchase
): Omit<Purchase, 'supplierInvoiceNumber' | 'normalizedSupplierInvoiceNumber' | 'expectedDeliveryDate' | 'notes'> {
  const {
    supplierInvoiceNumber: _invoice, normalizedSupplierInvoiceNumber: _normalized,
    expectedDeliveryDate: _expected, notes: _notes, ...rest
  } = purchase;
  void _invoice; void _normalized; void _expected; void _notes; return rest;
}
function toResponse(purchase: Purchase, items: readonly PurchaseItem[], canReadCosts: boolean): PurchaseResponse {
  return {
    id: purchase.id, purchaseNumber: purchase.purchaseNumber, supplierId: purchase.supplierId,
    supplierSnapshot: purchase.supplierSnapshot,
    ...(purchase.supplierInvoiceNumber ? { supplierInvoiceNumber: purchase.supplierInvoiceNumber } : {}),
    purchaseDate: purchase.purchaseDate,
    ...(purchase.expectedDeliveryDate ? { expectedDeliveryDate: purchase.expectedDeliveryDate } : {}),
    status: purchase.status, ...(purchase.notes ? { notes: purchase.notes } : {}),
    ...(purchase.cancellationReason ? { cancellationReason: purchase.cancellationReason } : {}),
    items: items.map((item): PurchaseItemResponse => ({
      id: item.id, productId: item.productId, presentationId: item.presentationId,
      productSnapshot: item.productSnapshot, presentationSnapshot: item.presentationSnapshot,
      quantity: item.quantity, quantityBaseInternal: item.quantityBaseInternal,
      orderedQuantityBaseInternal: item.orderedQuantityBaseInternal ?? item.quantityBaseInternal,
      receivedQuantityBaseInternal: item.receivedQuantityBaseInternal ?? 0,
      ...(canReadCosts ? {
        unitPurchasePriceGuarani: item.unitPurchasePriceGuarani,
        lineSubtotalGuarani: item.lineSubtotalGuarani,
        allocatedReceivedCostGuarani: item.allocatedReceivedCostGuarani ?? 0
      } : {}), ...(item.notes ? { notes: item.notes } : {}), sortOrder: item.sortOrder
    })),
    ...(canReadCosts ? {
      subtotalGuarani: purchase.subtotalGuarani, discountGuarani: purchase.discountGuarani,
      additionalCostsGuarani: purchase.additionalCostsGuarani, totalGuarani: purchase.totalGuarani
    } : {}), createdAt: purchase.createdAt, updatedAt: purchase.updatedAt,
    ...(purchase.confirmedAt ? { confirmedAt: purchase.confirmedAt } : {}),
    ...(purchase.cancelledAt ? { cancelledAt: purchase.cancelledAt } : {}),
    ...(purchase.confirmedBy ? { confirmedBy: purchase.confirmedBy } : {}),
    ...(purchase.cancelledBy ? { cancelledBy: purchase.cancelledBy } : {})
  };
}
