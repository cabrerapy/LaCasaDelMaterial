import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { InventorySummary, StockDetailResponse, StockFilters, StockPageResponse } from '@lcm/contracts';
@Injectable({ providedIn: 'root' })
export class StockApiService {
  private readonly http = inject(HttpClient);
  list(filters: StockFilters) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params = params.set(key, value);
    return this.http.get<StockPageResponse>('/api/inventory/stock', { params });
  }
  detail(id: string) { return this.http.get<StockDetailResponse>(`/api/inventory/stock/${id}`); }
  summary() { return this.http.get<InventorySummary>('/api/inventory/summary'); }
}
