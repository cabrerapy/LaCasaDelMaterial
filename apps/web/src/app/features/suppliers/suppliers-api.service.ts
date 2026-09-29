import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateSupplierRequest, SupplierResponse, SuppliersPageResponse,
  SupplierStatus, UpdateSupplierRequest
} from '@lcm/contracts';
import type { Observable } from 'rxjs';

export interface SupplierFilters {
  readonly pageSize?: number;
  readonly nextToken?: string;
  readonly search?: string;
  readonly status?: SupplierStatus;
}
@Injectable({ providedIn: 'root' })
export class SuppliersApiService {
  private readonly http = inject(HttpClient);
  list(filters: SupplierFilters): Observable<SuppliersPageResponse> {
    let params = new HttpParams().set('pageSize', filters.pageSize ?? 25);
    if (filters.nextToken) params = params.set('nextToken', filters.nextToken);
    if (filters.search) params = params.set('search', filters.search);
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<SuppliersPageResponse>('/api/suppliers', { params });
  }
  create(input: CreateSupplierRequest): Observable<SupplierResponse> {
    return this.http.post<SupplierResponse>('/api/suppliers', input);
  }
  update(id: string, input: UpdateSupplierRequest): Observable<SupplierResponse> {
    return this.http.patch<SupplierResponse>(`/api/suppliers/${id}`, input);
  }
  updateStatus(id: string, status: SupplierStatus): Observable<SupplierResponse> {
    return this.http.patch<SupplierResponse>(`/api/suppliers/${id}/status`, { status });
  }
}
