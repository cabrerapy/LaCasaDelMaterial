import type { DeliveryListOptions, DeliveryRepository } from '../domain/delivery.repository.js';
import { DeliveryConflictError } from '../domain/delivery.repository.js';
import type { DeliveryEvidence, DeliveryReceipt } from '../domain/delivery.js';
import type { TripRepository } from '../../trips/domain/trip.repository.js';
export class InMemoryDeliveryRepository implements DeliveryRepository {
  private readonly values=new Map<string,DeliveryReceipt>(); private readonly evidence=new Map<string,DeliveryEvidence>(); private sequence=0;
  constructor(private readonly trips?:TripRepository){}
  async nextNumber(year:number){this.sequence+=1;return `ENT-${year}-${String(this.sequence).padStart(6,'0')}`;}
  async findById(id:string){return this.values.get(id)??null;}
  async findByTripId(tripId:string){return [...this.values.values()].find(x=>x.tripId===tripId&&x.status!=='VOIDED')??[...this.values.values()].find(x=>x.tripId===tripId)??null;}
  async list(o:DeliveryListOptions){const start=Number(o.nextToken??0),all=[...this.values.values()].filter(x=>(!o.saleId||x.saleId===o.saleId)&&(!o.status||x.status===o.status)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),items=all.slice(start,start+o.limit);return{items,...(start+items.length<all.length?{nextToken:String(start+items.length)}:{})};}
  async create(d:DeliveryReceipt){if(await this.findByTripId(d.tripId))throw new DeliveryConflictError();this.values.set(d.id,d);}
  async update(d:DeliveryReceipt,e:string){this.check(d.id,e,'DRAFT');this.values.set(d.id,d);}
  async confirm(d:DeliveryReceipt,trip:Parameters<DeliveryRepository['confirm']>[1],truck:Parameters<DeliveryRepository['confirm']>[2],_load:Parameters<DeliveryRepository['confirm']>[3],e:string,tripExpected:string){this.check(d.id,e,'DRAFT');if(this.trips)await this.trips.deliver(trip,tripExpected,truck);this.values.set(d.id,d);}
  async void(d:DeliveryReceipt,e:string){this.check(d.id,e,'CONFIRMED');this.values.set(d.id,d);}
  async addEvidence(x:DeliveryEvidence){this.evidence.set(x.id,x);}
  async evidenceByDelivery(id:string){return[...this.evidence.values()].filter(x=>x.deliveryReceiptId===id);}
  async findEvidence(id:string){return this.evidence.get(id)??null;}
  private check(id:string,e:string,status:string){const x=this.values.get(id);if(!x||x.updatedAt!==e||x.status!==status)throw new DeliveryConflictError();}
}
