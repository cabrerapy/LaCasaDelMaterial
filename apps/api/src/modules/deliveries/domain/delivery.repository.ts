import type { DeliveryReceipt, DeliveryEvidence } from './delivery.js';
import type { Trip } from '../../trips/domain/trip.js';
import type { Truck } from '../../trucks/domain/truck.js';
import type { TripLoad } from '../../trip-loads/domain/trip-load.js';
export interface DeliveryListOptions { readonly limit:number; readonly nextToken?:string; readonly saleId?:string; readonly status?:string; }
export interface DeliveryRepository {
  nextNumber(year:number):Promise<string>;
  findById(id:string):Promise<DeliveryReceipt|null>;
  findByTripId(tripId:string):Promise<DeliveryReceipt|null>;
  list(options:DeliveryListOptions):Promise<{items:readonly DeliveryReceipt[];nextToken?:string}>;
  create(delivery:DeliveryReceipt):Promise<void>;
  update(delivery:DeliveryReceipt,expectedUpdatedAt:string):Promise<void>;
  confirm(delivery:DeliveryReceipt,trip:Trip,truck:Truck,load:TripLoad,expectedDeliveryUpdatedAt:string,expectedTripUpdatedAt:string):Promise<void>;
  void(delivery:DeliveryReceipt,expectedUpdatedAt:string):Promise<void>;
  addEvidence(evidence:DeliveryEvidence):Promise<void>;
  evidenceByDelivery(deliveryId:string):Promise<readonly DeliveryEvidence[]>;
  findEvidence(id:string):Promise<DeliveryEvidence|null>;
}
export class DeliveryConflictError extends Error {}
