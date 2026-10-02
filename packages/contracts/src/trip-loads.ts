export const TRIP_LOAD_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type TripLoadStatus = typeof TRIP_LOAD_STATUSES[number];
export type CapacityValidation = 'COMPLETE' | 'PARTIAL';

export interface TripLoadLineInput {
  readonly saleItemId: string;
  readonly quantityBaseInternal: number;
}

export interface TripLoadLineResponse extends TripLoadLineInput {
  readonly id: string;
  readonly productId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly baseUnit: string;
  readonly quantityScale: number;
  readonly estimatedWeightGrams?: number;
  readonly estimatedVolumeMl?: number;
}

export interface TripLoadResponse {
  readonly id: string;
  readonly tripId: string;
  readonly saleId: string;
  readonly status: TripLoadStatus;
  readonly lines: readonly TripLoadLineResponse[];
  readonly totalWeightGrams?: number;
  readonly totalVolumeMl?: number;
  readonly weightUtilizationBps?: number;
  readonly volumeUtilizationBps?: number;
  readonly capacityValidation: CapacityValidation;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly confirmedAt?: string;
  readonly cancelledAt?: string;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export interface SaveTripLoadRequest { readonly lines: readonly TripLoadLineInput[]; }
export interface SaleItemDeliveryBalanceResponse {
  readonly saleItemId: string;
  readonly productId: string;
  readonly productName: string;
  readonly quantityScale: number;
  readonly soldQuantityBaseInternal: number;
  readonly allocatedQuantityBaseInternal: number;
  readonly remainingQuantityBaseInternal: number;
}
