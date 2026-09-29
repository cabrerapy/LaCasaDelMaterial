import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CategoriesPageResponse,
  CategoryStatus,
  CreateCategoryRequest,
  ProductCategoryResponse,
  UpdateCategoryRequest
} from '@lcm/contracts';
import type { Observable } from 'rxjs';

export interface CategoryFilters {
  readonly pageSize?: number;
  readonly nextToken?: string;
  readonly status?: CategoryStatus;
  readonly search?: string;
}

@Injectable({ providedIn: 'root' })
export class CategoriesApiService {
  private readonly http = inject(HttpClient);

  list(filters: CategoryFilters): Observable<CategoriesPageResponse> {
    let params = new HttpParams().set('pageSize', filters.pageSize ?? 25);
    if (filters.nextToken) params = params.set('nextToken', filters.nextToken);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.search) params = params.set('search', filters.search);
    return this.http.get<CategoriesPageResponse>('/api/categories', { params });
  }

  create(input: CreateCategoryRequest): Observable<ProductCategoryResponse> {
    return this.http.post<ProductCategoryResponse>('/api/categories', input);
  }

  update(id: string, input: UpdateCategoryRequest): Observable<ProductCategoryResponse> {
    return this.http.patch<ProductCategoryResponse>(`/api/categories/${id}`, input);
  }

  updateStatus(id: string, status: CategoryStatus): Observable<ProductCategoryResponse> {
    return this.http.patch<ProductCategoryResponse>(`/api/categories/${id}/status`, { status });
  }
}
