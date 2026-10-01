import { BASE_UNIT_LABELS, type BaseUnit, type StockResponse } from '@lcm/contracts';
import { internalToDisplay } from '../../shared/quantity';
export const STOCK_LABELS = { OK: 'Disponible', LOW_STOCK: 'Stock bajo', OUT_OF_STOCK: 'Agotado', NOT_TRACKED: 'No controlado' } as const;
export function stockQuantity(value: number, scale: number, unit: BaseUnit): string {
  const amount = internalToDisplay(Math.abs(value), scale);
  return `${value < 0 ? '−' : ''}${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 9 }).format(amount)} ${BASE_UNIT_LABELS[unit]}`;
}
export function currentStock(row: StockResponse): string {
  return row.trackStock ? stockQuantity(row.onHandInternal, row.quantityScale, row.baseUnit) : 'No controlado';
}
