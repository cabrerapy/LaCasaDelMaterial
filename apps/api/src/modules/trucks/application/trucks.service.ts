import { randomUUID } from 'node:crypto';
import type { CreateTruckRequest, TruckResponse, TrucksPageResponse, TruckStatus, UpdateTruckRequest } from '@lcm/contracts';
import type { TruckListOptions, TruckRepository } from '../domain/truck.repository.js';
import { TruckUniquenessError } from '../domain/truck.repository.js';
import type { Truck } from '../domain/truck.js';
const VOLUME_SCALE = 1000;
export class TrucksService {
  constructor(private readonly repository: TruckRepository) {}
  async list(options: TruckListOptions): Promise<TrucksPageResponse> { const page = await this.repository.list({ ...options, ...(options.search ? { search: normalize(options.search) } : {}) }); return { items: page.items.map(response), ...(page.nextToken ? { nextToken: page.nextToken } : {}) }; }
  async get(id: string): Promise<TruckResponse> { return response(await this.require(id)); }
  async create(input: CreateTruckRequest, actor: string): Promise<TruckResponse> {
    const now = new Date().toISOString(); const fields = clean(input);
    const truck: Truck = { id: randomUUID(), ...fields, status: 'ACTIVE', normalizedSearch: searchText(fields), createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor };
    try { await this.repository.create(truck); } catch (error) { rethrow(error); } return response(truck);
  }
  async update(id: string, input: UpdateTruckRequest, actor: string): Promise<TruckResponse> {
    const current = await this.require(id); const currentVolume = volumeDisplay(current.maxVolumeM3Internal); const fields = clean({ ...current, ...input, plate: current.plate, ...(input.maxVolumeM3 !== undefined ? { maxVolumeM3: input.maxVolumeM3 } : currentVolume !== undefined ? { maxVolumeM3: currentVolume } : {}) });
    const updated: Truck = { id: current.id, ...fields, status: current.status, normalizedSearch: searchText(fields), createdAt: current.createdAt, createdBy: current.createdBy, updatedAt: new Date().toISOString(), updatedBy: actor };
    try { await this.repository.update(updated, current); } catch (error) { rethrow(error); } return response(updated);
  }
  async updateStatus(id: string, status: TruckStatus, actor: string): Promise<TruckResponse> { const current = await this.require(id); const updated = { ...current, status, updatedAt: new Date().toISOString(), updatedBy: actor }; await this.repository.update(updated, current); return response(updated); }
  private async require(id: string) { const found = await this.repository.findById(id); if (!found) throw appError('Camión no encontrado', 404); return found; }
}
function clean(input: CreateTruckRequest): Omit<Truck, 'id'|'status'|'normalizedSearch'|'createdAt'|'updatedAt'|'createdBy'|'updatedBy'> {
  const plate = input.plate.toUpperCase().replace(/\s+/g, ''); const brand = compact(input.brand); if (!plate) throw appError('La chapa es obligatoria', 400); if (!brand) throw appError('La marca es obligatoria', 400);
  const year = input.year; if (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > new Date().getUTCFullYear() + 1)) throw appError('El año no es válido', 400);
  if (input.maxLoadKg !== undefined && (!Number.isInteger(input.maxLoadKg) || input.maxLoadKg <= 0)) throw appError('La capacidad en kg debe ser mayor que cero', 400);
  if (!Number.isSafeInteger(input.currentOdometerKm ?? 0) || (input.currentOdometerKm ?? 0) < 0) throw appError('El kilometraje no es válido', 400);
  const maxVolumeM3Internal = input.maxVolumeM3 ? decimalToInternal(input.maxVolumeM3) : undefined; const internalCode = compact(input.internalCode)?.toUpperCase().replace(/\s+/g, ''); const model = compact(input.model); const notes = compact(input.notes);
  return { plate, ...(internalCode ? { internalCode } : {}), brand,
    ...(model ? { model } : {}), ...(year !== undefined ? { year } : {}), vehicleType: input.vehicleType,
    ...(input.maxLoadKg !== undefined ? { maxLoadKg: input.maxLoadKg } : {}), ...(maxVolumeM3Internal !== undefined ? { maxVolumeM3Internal } : {}),
    fuelType: input.fuelType, currentOdometerKm: input.currentOdometerKm ?? 0, ...(notes ? { notes } : {}) };
}
export function decimalToInternal(value: string): number { const normalized = value.trim().replace(',', '.'); if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) throw appError('La capacidad en m³ no es válida', 400); const [whole, fraction = ''] = normalized.split('.'); const result = Number(whole) * VOLUME_SCALE + Number(fraction.padEnd(3, '0')); if (!Number.isSafeInteger(result) || result <= 0) throw appError('La capacidad en m³ debe ser mayor que cero', 400); return result; }
function volumeDisplay(value?: number) { if (value === undefined) return undefined; const whole = Math.floor(value / VOLUME_SCALE); const fraction = String(value % VOLUME_SCALE).padStart(3, '0').replace(/0+$/, ''); return fraction ? `${whole}.${fraction}` : String(whole); }
function response(t: Truck): TruckResponse { return { id: t.id, plate: t.plate, ...(t.internalCode ? { internalCode: t.internalCode } : {}), brand: t.brand, ...(t.model ? { model: t.model } : {}), ...(t.year !== undefined ? { year: t.year } : {}), vehicleType: t.vehicleType, ...(t.maxLoadKg !== undefined ? { maxLoadKg: t.maxLoadKg } : {}), ...(t.maxVolumeM3Internal !== undefined ? { maxVolumeM3: volumeDisplay(t.maxVolumeM3Internal)! } : {}), fuelType: t.fuelType, currentOdometerKm: t.currentOdometerKm, status: t.status, ...(t.notes ? { notes: t.notes } : {}), createdAt: t.createdAt, updatedAt: t.updatedAt }; }
function searchText(value: Pick<Truck, 'plate'|'internalCode'|'brand'|'model'>) { return normalize([value.plate, value.internalCode, value.brand, value.model].filter(Boolean).join(' ')); }
function compact(value?: string) { const cleanValue = value?.trim().replace(/\s+/g, ' '); return cleanValue || undefined; }
function normalize(value: string) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es'); }
function rethrow(error: unknown): never { if (error instanceof TruckUniquenessError) throw appError(error.field === 'plate' ? 'La chapa ya está registrada' : 'El código interno ya está registrado', 409); throw error; }
function appError(message: string, statusCode: number) { return Object.assign(new Error(message), { statusCode }); }
