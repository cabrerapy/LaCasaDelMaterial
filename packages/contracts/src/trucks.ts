export const VEHICLE_TYPES = ['TRUCK', 'TIPPER', 'FLATBED', 'PICKUP', 'OTHER'] as const;
export type VehicleType = typeof VEHICLE_TYPES[number];
export const VEHICLE_TYPE_LABELS: Readonly<Record<VehicleType, string>> = { TRUCK: 'Camión', TIPPER: 'Volquete', FLATBED: 'Plataforma', PICKUP: 'Camioneta', OTHER: 'Otro' };
export const FUEL_TYPES = ['DIESEL', 'GASOLINE', 'FLEX', 'OTHER'] as const;
export type FuelType = typeof FUEL_TYPES[number];
export const FUEL_TYPE_LABELS: Readonly<Record<FuelType, string>> = { DIESEL: 'Diésel', GASOLINE: 'Nafta', FLEX: 'Flex', OTHER: 'Otro' };
export const TRUCK_STATUSES = ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] as const;
export type TruckStatus = typeof TRUCK_STATUSES[number];
export const TRUCK_STATUS_LABELS: Readonly<Record<TruckStatus, string>> = { ACTIVE: 'Disponible', MAINTENANCE: 'Mantenimiento', INACTIVE: 'Inactivo' };
export interface TruckResponse {
  readonly id: string; readonly plate: string; readonly internalCode?: string; readonly brand: string; readonly model?: string;
  readonly year?: number; readonly vehicleType: VehicleType; readonly maxLoadKg?: number; readonly maxVolumeM3?: string;
  readonly fuelType: FuelType; readonly currentOdometerKm: number; readonly status: TruckStatus; readonly notes?: string;
  readonly createdAt: string; readonly updatedAt: string;
}
export interface TrucksPageResponse { readonly items: readonly TruckResponse[]; readonly nextToken?: string; }
export interface CreateTruckRequest {
  readonly plate: string; readonly internalCode?: string; readonly brand: string; readonly model?: string; readonly year?: number;
  readonly vehicleType: VehicleType; readonly maxLoadKg?: number; readonly maxVolumeM3?: string;
  readonly fuelType: FuelType; readonly currentOdometerKm?: number; readonly notes?: string;
}
export type UpdateTruckRequest = Omit<Partial<CreateTruckRequest>, 'plate'>;
export interface UpdateTruckStatusRequest { readonly status: TruckStatus; }
