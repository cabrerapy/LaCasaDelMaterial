import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CreateCustomerRequest, CustomerResponse, CustomersPageResponse, CustomerStatus, CustomerType, UpdateCustomerRequest } from '@lcm/contracts';
export interface CustomerFilters { pageSize?: number; nextToken?: string; search?: string; type?: CustomerType; status?: CustomerStatus; city?: string; }
@Injectable({ providedIn: 'root' })
export class CustomersApiService {
  private readonly http = inject(HttpClient);
  list(filters: CustomerFilters) {
    let params = new HttpParams().set('pageSize', filters.pageSize ?? 25);
    for (const [key, value] of Object.entries(filters)) if (value) params = params.set(key, value);
    return this.http.get<CustomersPageResponse>('/api/customers', { params });
  }
  create(value: CreateCustomerRequest) { return this.http.post<CustomerResponse>('/api/customers', value); }
  update(id: string, value: UpdateCustomerRequest) { return this.http.patch<CustomerResponse>(`/api/customers/${id}`, value); }
  status(id: string, status: CustomerStatus) { return this.http.patch<CustomerResponse>(`/api/customers/${id}/status`, { status }); }
}
