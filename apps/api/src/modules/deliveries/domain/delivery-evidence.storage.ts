export interface StoredDeliveryEvidence { readonly storageKey:string; readonly absolutePath:string; }
export interface DeliveryEvidenceStorage { save(deliveryId:string,extension:string,content:Buffer):Promise<StoredDeliveryEvidence>; resolve(storageKey:string):Promise<string>; }
