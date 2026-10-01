import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { InventoryMovementFilters, InventoryMovementResponse, InventoryMovementsPageResponse } from '@lcm/contracts';
import type { Observable } from 'rxjs';
@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  private readonly http = inject(HttpClient);
  list(filters: InventoryMovementFilters): Observable<InventoryMovementsPageResponse> {
    let params = new HttpParams().set('pageSize', filters.pageSize ?? 25);
    for (const [name, value] of Object.entries(filters)) if (value !== undefined && value !== '') params = params.set(name, value);
    return this.http.get<InventoryMovementsPageResponse>('/api/inventory/movements', { params });
  }
  get(id: string): Observable<InventoryMovementResponse> { return this.http.get<InventoryMovementResponse>(`/api/inventory/movements/${id}`); }
}
