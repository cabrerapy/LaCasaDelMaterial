import type { InventoryMovementFilters } from '@lcm/contracts';
import { aggregate, InventoryConflictError, sourceKey, safeSum, type InventoryBalance, type InventoryMovement, type InventoryRepository } from '../domain/inventory.js';

export class InMemoryInventoryRepository implements InventoryRepository {
  private readonly movements = new Map<string, InventoryMovement>();
  private readonly sources = new Map<string, string>();
  private readonly balances = new Map<string, InventoryBalance>();
  private queue: Promise<void> = Promise.resolve();
  async get(id: string) { return this.movements.get(id) ?? null; }
  async byNumber(number: string) { return [...this.movements.values()].find((item) => item.movementNumber === number) ?? null; }
  async bySource(receiptId: string, lineId: string) { return this.movements.get(this.sources.get(sourceKey(receiptId, lineId)) ?? '') ?? null; }
  async getBalance(productId: string) { return this.balances.get(productId) ?? null; }
  async getBalances(ids: readonly string[]) { return [...this.balances.values()].filter((item) => ids.includes(item.productId)); }
  async allMovements() { return [...this.movements.values()]; }
  async allBalances() { return [...this.balances.values()]; }
  async list(filters: InventoryMovementFilters) {
    const search = filters.search?.trim().toLowerCase();
    const values = [...this.movements.values()].filter((item) =>
      (!filters.productId || item.productId === filters.productId) && (!filters.lotId || item.lotId === filters.lotId)
      && (!filters.type || item.type === filters.type) && (!filters.sourceType || item.sourceType === filters.sourceType)
      && (!filters.dateFrom || item.occurredAt >= filters.dateFrom) && (!filters.dateTo || item.occurredAt.slice(0, 10) <= filters.dateTo)
      && (!search || item.movementNumber.toLowerCase().includes(search) || item.referenceNumber.toLowerCase().includes(search)))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const offset = Number(filters.nextToken ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw Object.assign(new Error('Cursor inválido'), { statusCode: 400 });
    const items = values.slice(offset, offset + (filters.pageSize ?? 25));
    return { items, ...(offset + items.length < values.length ? { nextToken: String(offset + items.length) } : {}) };
  }
  async append(movements: readonly InventoryMovement[]) { return this.atomic(movements, async () => {}); }
  /** Adapter's unit of work: validate first, run participant, then publish with no further awaits/failures. */
  async atomic(movements: readonly InventoryMovement[], participant: () => Promise<void>): Promise<void> {
    const previous = this.queue; let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; }); await previous;
    try {
      const totals = aggregate(movements); const seen = new Set<string>();
      for (const item of movements) {
        const key = sourceKey(item.sourceId, item.sourceLineId);
        if (this.sources.has(key) || seen.has(key) || this.movements.has(item.id)
          || [...this.movements.values()].some((old) => old.movementNumber === item.movementNumber)) throw new InventoryConflictError();
        seen.add(key);
      }
      const balances = [...totals].map(([productId, delta]): InventoryBalance => ({
        productId, onHandInternal: safeSum(this.balances.get(productId)?.onHandInternal ?? 0, delta),
        version: (this.balances.get(productId)?.version ?? 0) + 1, updatedAt: new Date().toISOString()
      }));
      await participant();
      for (const item of movements) { this.movements.set(item.id, item); this.sources.set(sourceKey(item.sourceId, item.sourceLineId), item.id); }
      for (const balance of balances) this.balances.set(balance.productId, balance);
    } finally { release(); }
  }
  async replaceBalance(balance: InventoryBalance, expectedVersion: number | null): Promise<void> {
    await this.atomic([], async () => {
      if ((this.balances.get(balance.productId)?.version ?? null) !== expectedVersion) throw new InventoryConflictError();
      this.balances.set(balance.productId, balance);
    });
  }
}
