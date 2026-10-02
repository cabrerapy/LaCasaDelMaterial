import type { FuelType, TruckStatus, VehicleType } from '@lcm/contracts';
export interface Truck {
  readonly id: string; readonly plate: string; readonly internalCode?: string; readonly brand: string; readonly model?: string;
  readonly year?: number; readonly vehicleType: VehicleType; readonly maxLoadKg?: number; readonly maxVolumeM3Internal?: number;
  readonly fuelType: FuelType; readonly currentOdometerKm: number; readonly status: TruckStatus; readonly notes?: string;
  readonly normalizedSearch: string; readonly createdAt: string; readonly updatedAt: string; readonly createdBy: string; readonly updatedBy: string;
}
