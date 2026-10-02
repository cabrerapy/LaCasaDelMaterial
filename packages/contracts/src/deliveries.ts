export const DELIVERY_STATUSES = ['DRAFT', 'CONFIRMED', 'VOIDED'] as const;
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];
export const DELIVERY_OUTCOMES = ['FULL', 'PARTIAL', 'FAILED'] as const;
export type DeliveryOutcome = typeof DELIVERY_OUTCOMES[number];
export const DELIVERY_INCIDENT_TYPES = ['NONE', 'SHORTAGE', 'DAMAGED', 'REJECTED', 'CUSTOMER_ABSENT', 'ACCESS_PROBLEM', 'OTHER'] as const;
export type DeliveryIncidentType = typeof DELIVERY_INCIDENT_TYPES[number];
export const DELIVERY_EVIDENCE_TYPES = ['PHOTO', 'SIGNATURE', 'DOCUMENT'] as const;
export type DeliveryEvidenceType = typeof DELIVERY_EVIDENCE_TYPES[number];
export type DeliveryFulfillmentStatus = 'NOT_REQUIRED' | 'PENDING' | 'PARTIALLY_DELIVERED' | 'DELIVERED';
export interface DeliveryLineInput { readonly tripLoadLineId:string; readonly deliveredQuantityBaseInternal:number; readonly incidentType:DeliveryIncidentType; readonly incidentNotes?:string; }
export interface DeliveryReceiptLineResponse extends DeliveryLineInput { readonly id:string; readonly deliveryReceiptId:string; readonly tripId:string; readonly tripLoadId:string; readonly saleId:string; readonly saleItemId:string; readonly productId:string; readonly productSnapshot:{readonly code:string;readonly name:string;readonly baseUnit:string;readonly quantityScale:number}; readonly loadedQuantityBaseInternal:number; readonly undeliveredQuantityBaseInternal:number; readonly createdAt:string; readonly updatedAt:string; }
export interface DeliveryReceiptResponse { readonly id:string; readonly deliveryNumber:string; readonly tripId:string; readonly saleId:string; readonly customerId?:string; readonly status:DeliveryStatus; readonly outcome?:DeliveryOutcome; readonly receiverName?:string; readonly receiverDocument?:string; readonly receiverPhone?:string; readonly deliveryAddressSnapshot:string; readonly deliveredAt?:string; readonly odometerEndKm?:number; readonly generalNotes?:string; readonly lines:readonly DeliveryReceiptLineResponse[]; readonly createdAt:string; readonly updatedAt:string; readonly confirmedAt?:string; readonly voidedAt?:string; readonly createdBy:string; readonly updatedBy:string; readonly confirmedBy?:string; readonly voidedBy?:string; readonly voidReason?:string; }
export interface CreateDeliveryRequest { readonly receiverName?:string; readonly receiverDocument?:string; readonly receiverPhone?:string; readonly generalNotes?:string; readonly lines?:readonly DeliveryLineInput[]; }
export type UpdateDeliveryRequest = CreateDeliveryRequest;
export interface ConfirmDeliveryRequest { readonly odometerEndKm:number; }
export interface VoidDeliveryRequest { readonly reason:string; }
export interface DeliveriesPageResponse { readonly items:readonly DeliveryReceiptResponse[]; readonly nextToken?:string; }
export interface DeliveryEvidenceResponse { readonly id:string; readonly deliveryReceiptId:string; readonly type:DeliveryEvidenceType; readonly originalFileName:string; readonly mimeType:string; readonly sizeBytes:number; readonly createdAt:string; readonly createdBy:string; }
