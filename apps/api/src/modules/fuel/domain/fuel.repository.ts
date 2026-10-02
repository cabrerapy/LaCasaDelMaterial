import type { FuelStatus } from '@lcm/contracts';import type{FuelTransaction}from'./fuel.js';
export interface FuelListOptions{readonly limit:number;readonly nextToken?:string;readonly truckId?:string;readonly tripId?:string;readonly driverId?:string;readonly status?:FuelStatus;readonly dateFrom?:string;readonly dateTo?:string;readonly stationName?:string;}
export interface FuelRepository{nextNumber(year:string):Promise<string>;findById(id:string):Promise<FuelTransaction|null>;create(value:FuelTransaction):Promise<void>;void(value:FuelTransaction):Promise<void>;list(options:FuelListOptions):Promise<{items:readonly FuelTransaction[];nextToken?:string}>;}
export class FuelConflictError extends Error{}
