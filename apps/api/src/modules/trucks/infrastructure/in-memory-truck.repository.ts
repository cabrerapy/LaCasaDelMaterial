import type { TruckListOptions, TruckPage, TruckRepository } from '../domain/truck.repository.js';
import { TruckUniquenessError } from '../domain/truck.repository.js';
import type { Truck } from '../domain/truck.js';
export class InMemoryTruckRepository implements TruckRepository {
  private readonly values = new Map<string, Truck>();
  async findById(id: string) { return this.values.get(id) ?? null; }
  async list(options: TruckListOptions): Promise<TruckPage> { const start = Number(options.nextToken ?? 0); if (!Number.isSafeInteger(start) || start < 0) throw Object.assign(new Error('Cursor inválido'), { statusCode: 400 }); const all = [...this.values.values()].filter((truck) => (!options.status || truck.status === options.status) && (!options.vehicleType || truck.vehicleType === options.vehicleType) && (!options.fuelType || truck.fuelType === options.fuelType) && (!options.search || truck.normalizedSearch.includes(options.search))).sort((a, b) => a.plate.localeCompare(b.plate)); const items = all.slice(start, start + options.limit); return { items, ...(start + items.length < all.length ? { nextToken: String(start + items.length) } : {}) }; }
  async create(truck: Truck) { this.unique(truck); this.values.set(truck.id, truck); }
  async update(truck: Truck, previous: Truck) { void previous; this.unique(truck, truck.id); if (!this.values.has(truck.id)) throw new Error('Truck not found'); this.values.set(truck.id, truck); }
  private unique(truck: Truck, own?: string) { for (const item of this.values.values()) { if (item.id === own) continue; if (item.plate === truck.plate) throw new TruckUniquenessError('plate'); if (truck.internalCode && item.internalCode === truck.internalCode) throw new TruckUniquenessError('internalCode'); } }
}
