import type { FuelType, TruckStatus, VehicleType } from '@lcm/contracts';
import type { Truck } from './truck.js';
export interface TruckListOptions { readonly limit: number; readonly nextToken?: string; readonly search?: string; readonly status?: TruckStatus; readonly vehicleType?: VehicleType; readonly fuelType?: FuelType; }
export interface TruckPage { readonly items: readonly Truck[]; readonly nextToken?: string; }
export interface TruckRepository { findById(id: string): Promise<Truck | null>; list(options: TruckListOptions): Promise<TruckPage>; create(truck: Truck): Promise<void>; update(truck: Truck, previous: Truck): Promise<void>; }
export class TruckUniquenessError extends Error { constructor(readonly field: 'plate' | 'internalCode') { super('Truck unique value already exists'); } }
