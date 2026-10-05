import type { TripLoadRepository } from '../domain/trip-load.repository.js';
import { TripLoadConflictError } from '../domain/trip-load.repository.js';
import type { TripLoad } from '../domain/trip-load.js';
export class InMemoryTripLoadRepository implements TripLoadRepository {
 private readonly values=new Map<string,TripLoad>();
 async findByTripId(id:string){return this.values.get(id)??null;}
 async saveDraft(load:TripLoad,expected?:string){const old=this.values.get(load.tripId);if(expected&&old?.updatedAt!==expected)throw new TripLoadConflictError();if(!expected&&old)throw new TripLoadConflictError();this.values.set(load.tripId,load);}
 async confirm(load:TripLoad,sold:ReadonlyMap<string,number>,expected:string){const old=this.values.get(load.tripId);if(!old||old.updatedAt!==expected||old.status!=='DRAFT')throw new TripLoadConflictError();const allocated=await this.allocatedForSale(load.saleId,load.tripId);for(const line of load.lines)if((allocated.get(line.saleItemId)??0)+line.quantityBaseInternal>(sold.get(line.saleItemId)??0))throw new TripLoadConflictError();this.values.set(load.tripId,load);}
 async cancel(load:TripLoad,expected:string){const old=this.values.get(load.tripId);if(!old||old.updatedAt!==expected||old.status!=='CONFIRMED')throw new TripLoadConflictError();this.values.set(load.tripId,load);}
 async allocatedForSale(saleId:string,exclude?:string){const out=new Map<string,number>();for(const load of this.values.values())if(load.saleId===saleId&&load.tripId!==exclude&&load.status==='CONFIRMED')for(const l of load.lines)out.set(l.saleItemId,(out.get(l.saleItemId)??0)+l.quantityBaseInternal);return out;}
 async getBalance(saleId:string,saleItemId:string){return{allocated:(await this.allocatedForSale(saleId)).get(saleItemId)??0,delivered:0};}
 async all(){return [...this.values.values()];}
 async rebuildBalances(){return;}
 async verifyBalances(){return [];}
}
