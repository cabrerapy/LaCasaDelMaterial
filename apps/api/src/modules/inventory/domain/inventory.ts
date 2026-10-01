import type { InventoryMovementResponse, InventoryMovementFilters } from '@lcm/contracts';

export interface InventoryMovement extends InventoryMovementResponse { readonly costGuarani: number; }
export interface InventoryBalance {
  readonly productId: string;
  readonly onHandInternal: number;
  readonly version: number;
  readonly updatedAt: string;
}
export interface InventoryPage { readonly items: readonly InventoryMovement[]; readonly nextToken?: string; }
export interface InventoryRepository {
  get(id: string): Promise<InventoryMovement | null>;
  byNumber(number: string): Promise<InventoryMovement | null>;
  bySource(receiptId: string, lineId: string): Promise<InventoryMovement | null>;
  list(filters: InventoryMovementFilters): Promise<InventoryPage>;
  getBalance(productId: string): Promise<InventoryBalance | null>;
  append(movements: readonly InventoryMovement[]): Promise<void>;
  allMovements(): Promise<readonly InventoryMovement[]>;
  allBalances(): Promise<readonly InventoryBalance[]>;
  replaceBalance(balance: InventoryBalance, expectedVersion: number | null): Promise<void>;
}
export class InventoryConflictError extends Error {
  readonly statusCode = 409;
  constructor(message = 'El inventario cambió; vuelva a intentar la operación') { super(message); }
}
export function safeSum(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new Error('Cantidad de inventario fuera del rango seguro');
  return sum;
}
export function sourceKey(receiptId: string, lineId: string): string { return `SOURCE#PURCHASE_RECEIPT#${receiptId}#${lineId}`; }
export function aggregate(movements: readonly InventoryMovement[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const movement of movements) {
    if (movement.type !== 'PURCHASE_RECEIPT' || !Number.isSafeInteger(movement.quantityDeltaInternal) || movement.quantityDeltaInternal <= 0
      || !Number.isSafeInteger(movement.costGuarani) || movement.costGuarani < 0) throw new Error('Movimiento de inventario inválido');
    totals.set(movement.productId, safeSum(totals.get(movement.productId) ?? 0, movement.quantityDeltaInternal));
  }
  return totals;
}
