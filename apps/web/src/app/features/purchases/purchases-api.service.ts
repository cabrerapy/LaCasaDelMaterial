import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CancelPurchaseRequest, CreatePurchaseRequest, PurchaseResponse, PurchasesPageResponse,
  PurchaseStatus, UpdatePurchaseRequest
} from '@lcm/contracts';
import type { Observable } from 'rxjs';

export interface PurchaseFilters {
  readonly pageSize?: number; readonly nextToken?: string; readonly search?: string;
  readonly supplierId?: string; readonly status?: PurchaseStatus; readonly dateFrom?: string; readonly dateTo?: string;
}
@Injectable({ providedIn: 'root' })
export class PurchasesApiService {
  private readonly http = inject(HttpClient);
  list(filters: PurchaseFilters): Observable<PurchasesPageResponse> {
    let params = new HttpParams().set('pageSize', filters.pageSize ?? 25);
    if (filters.nextToken) params = params.set('nextToken', filters.nextToken);
    if (filters.search) params = params.set('search', filters.search);
    if (filters.supplierId) params = params.set('supplierId', filters.supplierId);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
    return this.http.get<PurchasesPageResponse>('/api/purchases', { params });
  }
  get(id: string): Observable<PurchaseResponse> { return this.http.get<PurchaseResponse>(`/api/purchases/${id}`); }
  create(input: CreatePurchaseRequest): Observable<PurchaseResponse> { return this.http.post<PurchaseResponse>('/api/purchases', input); }
  update(id: string, input: UpdatePurchaseRequest): Observable<PurchaseResponse> {
    return this.http.patch<PurchaseResponse>(`/api/purchases/${id}`, input);
  }
  confirm(id: string): Observable<PurchaseResponse> { return this.http.post<PurchaseResponse>(`/api/purchases/${id}/confirm`, {}); }
  cancel(id: string, input: CancelPurchaseRequest): Observable<PurchaseResponse> {
    return this.http.post<PurchaseResponse>(`/api/purchases/${id}/cancel`, input);
  }
}
