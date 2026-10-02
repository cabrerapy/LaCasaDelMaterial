export const DRIVER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type DriverStatus = typeof DRIVER_STATUSES[number];
export const DRIVER_STATUS_LABELS: Readonly<Record<DriverStatus, string>> = { ACTIVE: 'Disponible', INACTIVE: 'Inactivo', SUSPENDED: 'Suspendido' };
export interface DriverUserSummary { readonly id: string; readonly username: string; readonly status: 'ACTIVE'|'INACTIVE'; }
export interface DriverResponse { readonly id: string; readonly userId?: string; readonly user?: DriverUserSummary; readonly firstName: string; readonly lastName?: string; readonly displayName: string; readonly documentNumber?: string; readonly phone?: string; readonly licenseNumber?: string; readonly licenseCategory?: string; readonly licenseExpirationDate?: string; readonly licenseExpired: boolean; readonly status: DriverStatus; readonly notes?: string; readonly createdAt: string; readonly updatedAt: string; }
export interface DriversPageResponse { readonly items: readonly DriverResponse[]; readonly nextToken?: string; }
export interface CreateDriverRequest { readonly userId?: string; readonly firstName: string; readonly lastName?: string; readonly documentNumber?: string; readonly phone?: string; readonly licenseNumber?: string; readonly licenseCategory?: string; readonly licenseExpirationDate?: string; readonly notes?: string; }
export type UpdateDriverRequest = Partial<CreateDriverRequest>;
export interface UpdateDriverStatusRequest { readonly status: DriverStatus; }
