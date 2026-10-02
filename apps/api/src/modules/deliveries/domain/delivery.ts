import type { DeliveryEvidenceResponse, DeliveryReceiptResponse } from '@lcm/contracts';
export type DeliveryReceipt = DeliveryReceiptResponse;
export type DeliveryEvidence = DeliveryEvidenceResponse & { readonly storageKey:string };
