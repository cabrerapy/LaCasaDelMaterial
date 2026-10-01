import type { InventoryRepository } from '../../inventory/domain/inventory.js';
import type { Sale } from '../domain/sale.js';
import { SaleConflictError, type SaleListOptions, type SalePage, type SaleRepository } from '../domain/sale.repository.js';
import type { InventoryMovement } from '../../inventory/domain/inventory.js';
export class InMemorySaleRepository implements SaleRepository {
  private readonly sales = new Map<string, Sale>();
  constructor(private readonly inventory: InventoryRepository) {}
  async findById(id: string) { return this.sales.get(id) ?? null; }
  async list(o: SaleListOptions): Promise<SalePage> {
    const start = o.nextToken ? Number(o.nextToken) : 0; const q = o.search?.toLocaleLowerCase('es');
    const filtered = [...this.sales.values()].filter(s => !o.status || s.status === o.status)
      .filter(s => !o.customerId || s.customerId === o.customerId).filter(s => !o.userId || s.createdBy === o.userId)
      .filter(s => !o.paymentMethod || s.paymentMethod === o.paymentMethod).filter(s => !o.dateFrom || s.saleDate >= o.dateFrom)
      .filter(s => !o.dateTo || s.saleDate <= o.dateTo).filter(s => !q || s.saleNumber.toLowerCase().includes(q) || s.customerSnapshot?.displayName.toLocaleLowerCase('es').includes(q))
      .sort((a,b) => b.saleDate.localeCompare(a.saleDate) || b.createdAt.localeCompare(a.createdAt));
    const items=filtered.slice(start,start+o.limit); return {items,...(start+items.length<filtered.length?{nextToken:String(start+items.length)}:{})};
  }
  async create(sale: Sale) { if ([...this.sales.values()].some(s=>s.saleNumber===sale.saleNumber)) throw new SaleConflictError('NUMBER'); this.sales.set(sale.id,sale); }
  async replace(sale: Sale, expected: string) { const current=this.sales.get(sale.id); if(!current||current.updatedAt!==expected) throw new SaleConflictError(); this.sales.set(sale.id,sale); }
  async confirm(sale: Sale, movements: readonly InventoryMovement[], expected: string) { await this.transition(sale,movements,expected); }
  async void(sale: Sale, movements: readonly InventoryMovement[], expected: string) { await this.transition(sale,movements,expected); }
  private async transition(sale: Sale, movements: readonly InventoryMovement[], expected: string) { const current=this.sales.get(sale.id); if(!current||current.updatedAt!==expected) throw new SaleConflictError(); try { if(movements.length) await this.inventory.append(movements); } catch { throw new SaleConflictError('STOCK'); } this.sales.set(sale.id,sale); }
}
