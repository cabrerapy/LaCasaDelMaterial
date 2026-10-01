import { BASE_UNIT_LABELS, type InventoryMovementResponse } from '@lcm/contracts';
import { internalToDisplay } from '../../shared/quantity';
export function movementQuantity(item: InventoryMovementResponse): string {
  const amount = internalToDisplay(Math.abs(item.quantityDeltaInternal), item.productSnapshot.quantityScale);
  return `${item.quantityDeltaInternal >= 0 ? '+' : '−'}${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 9 }).format(amount)} ${BASE_UNIT_LABELS[item.productSnapshot.baseUnit]}`;
}
export const MOVEMENT_LABELS = { PURCHASE_RECEIPT: 'Recepción de compra' } as const;
