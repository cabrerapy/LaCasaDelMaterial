import { HttpClient, HttpParams } from '@angular/common/http'; import { inject, Injectable } from '@angular/core'; import type { CreatePurchaseReceiptRequest, PurchaseLotResponse, PurchaseLotsPageResponse, PurchaseReceiptResponse, PurchaseReceiptsPageResponse, PurchaseReceivingStatusResponse, UpdatePurchaseReceiptRequest } from '@lcm/contracts'; import type { Observable } from 'rxjs';
@Injectable({ providedIn: 'root' }) export class ReceivingApiService {
  private readonly http = inject(HttpClient);
  receipts(filters: Record<string, string | number | undefined> = {}): Observable<PurchaseReceiptsPageResponse> { return this.http.get<PurchaseReceiptsPageResponse>('/api/purchase-receipts', { params: params(filters) }); }
  receipt(id: string): Observable<PurchaseReceiptResponse> { return this.http.get<PurchaseReceiptResponse>(`/api/purchase-receipts/${id}`); }
  create(value: CreatePurchaseReceiptRequest): Observable<PurchaseReceiptResponse> { return this.http.post<PurchaseReceiptResponse>('/api/purchase-receipts', value); }
  update(id: string, value: UpdatePurchaseReceiptRequest): Observable<PurchaseReceiptResponse> { return this.http.patch<PurchaseReceiptResponse>(`/api/purchase-receipts/${id}`, value); }
  confirm(id: string): Observable<PurchaseReceiptResponse> { return this.http.post<PurchaseReceiptResponse>(`/api/purchase-receipts/${id}/confirm`, {}); }
  cancel(id: string): Observable<PurchaseReceiptResponse> { return this.http.post<PurchaseReceiptResponse>(`/api/purchase-receipts/${id}/cancel`, {}); }
  status(purchaseId: string): Observable<PurchaseReceivingStatusResponse> { return this.http.get<PurchaseReceivingStatusResponse>(`/api/purchases/${purchaseId}/receiving-status`); }
  lots(filters: Record<string, string | number | undefined> = {}): Observable<PurchaseLotsPageResponse> { return this.http.get<PurchaseLotsPageResponse>('/api/lots', { params: params(filters) }); }
  lot(id: string): Observable<PurchaseLotResponse> { return this.http.get<PurchaseLotResponse>(`/api/lots/${id}`); }
}
function params(values: Record<string, string | number | undefined>): HttpParams { let result = new HttpParams(); Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') result = result.set(key, value); }); return result; }
