import { randomUUID } from 'node:crypto';
import type { InventoryMovementFilters, InventoryMovementResponse, InventoryMovementsPageResponse } from '@lcm/contracts';
import type { PurchaseLot } from '../../receiving/domain/receiving.js';
import { InventoryConflictError, safeSum, type InventoryMovement, type InventoryRepository } from '../domain/inventory.js';

/** Sole business entry point for ledger postings and balance maintenance. No arbitrary HTTP writes. */
export class InventoryService {
  constructor(private readonly repository: InventoryRepository) {}
  prepareReceipt(lots: readonly PurchaseLot[]): readonly InventoryMovement[] {
    return lots.map((lot) => {
      if (!Number.isSafeInteger(lot.receivedQuantityBaseInternal) || lot.receivedQuantityBaseInternal <= 0
        || !Number.isSafeInteger(lot.directPurchaseCostGuarani) || lot.directPurchaseCostGuarani < 0) throw new Error('Lote inválido');
      const id = randomUUID();
      return {
        id, movementNumber: `MOV-${lot.receivedAt.slice(0, 4)}-${id.toUpperCase()}`,
        productId: lot.productId, productSnapshot: lot.productSnapshot, lotId: lot.id, lotNumber: lot.lotNumber,
        purchaseId: lot.purchaseId, type: 'PURCHASE_RECEIPT', quantityDeltaInternal: lot.receivedQuantityBaseInternal,
        sourceType: 'PURCHASE_RECEIPT', sourceId: lot.receiptId, sourceLineId: lot.receiptLineId,
        referenceNumber: lot.receiptNumber, costGuarani: lot.directPurchaseCostGuarani,
        occurredAt: lot.receivedAt.length === 10 ? `${lot.receivedAt}T00:00:00.000Z` : lot.receivedAt,
        createdAt: lot.createdAt, createdBy: lot.createdBy
      };
    });
  }
  async backfillLot(lot: PurchaseLot): Promise<boolean> {
    if (await this.repository.bySource(lot.receiptId, lot.receiptLineId)) return false;
    try { await this.repository.append(this.prepareReceipt([lot])); return true; }
    catch (error: unknown) {
      if (error instanceof InventoryConflictError && await this.repository.bySource(lot.receiptId, lot.receiptLineId)) return false;
      throw error;
    }
  }
  getBalance(productId: string) { return this.repository.getBalance(productId); }
  async rebuildBalance(productId: string): Promise<void> {
    // Capture the version BEFORE reading the ledger. Any concurrent posting invalidates the final CAS.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await this.repository.getBalance(productId);
      const movements = (await this.repository.allMovements()).filter((item) => item.productId === productId);
      const total = movements.reduce((sum, movement) => safeSum(sum, movement.quantityDeltaInternal), 0);
      if (total < 0) throw new Error(`Saldo negativo para ${productId}`);
      try {
        await this.repository.replaceBalance({ productId, onHandInternal: total, version: (before?.version ?? 0) + 1, updatedAt: new Date().toISOString() }, before?.version ?? null);
        return;
      } catch (error: unknown) { if (!(error instanceof InventoryConflictError) || attempt === 2) throw error; }
    }
  }
  async list(filters: InventoryMovementFilters, costs: boolean): Promise<InventoryMovementsPageResponse> {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw Object.assign(new Error('Rango de fechas inválido'), { statusCode: 400 });
    const page = await this.repository.list(filters);
    return { ...page, items: page.items.map((item) => response(item, costs)) };
  }
  async get(id: string, costs: boolean): Promise<InventoryMovementResponse> {
    const movement = await this.repository.get(id);
    if (!movement) throw Object.assign(new Error('Movimiento no encontrado'), { statusCode: 404 });
    return response(movement, costs);
  }
}
function response(movement: InventoryMovement, costs: boolean): InventoryMovementResponse {
  const { costGuarani, ...safe } = movement;
  return { ...safe, ...(costs ? { costGuarani } : {}) };
}
