import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateProductPresentationRequest,
  CreateProductRequest,
  ProductPresentationResponse,
  ProductResponse,
  ProductsPageResponse,
  ProductStatus,
  UpdateProductPresentationRequest,
  UpdateProductRequest
} from '@lcm/contracts';
import type { Observable } from 'rxjs';

export interface ProductFilters {
  readonly pageSize?: number;
  readonly nextToken?: string;
  readonly search?: string;
  readonly categoryId?: string;
  readonly status?: ProductStatus;
}

@Injectable({ providedIn: 'root' })
export class ProductsApiService {
  private readonly http = inject(HttpClient);
  list(filters: ProductFilters): Observable<ProductsPageResponse> {
    let params = new HttpParams().set('pageSize', filters.pageSize ?? 25);
    if (filters.nextToken) params = params.set('nextToken', filters.nextToken);
    if (filters.search) params = params.set('search', filters.search);
    if (filters.categoryId) params = params.set('categoryId', filters.categoryId);
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<ProductsPageResponse>('/api/products', { params });
  }
  create(input: CreateProductRequest): Observable<ProductResponse> {
    return this.http.post<ProductResponse>('/api/products', input);
  }
  update(id: string, input: UpdateProductRequest): Observable<ProductResponse> {
    return this.http.patch<ProductResponse>(`/api/products/${id}`, input);
  }
  updateStatus(id: string, status: ProductStatus): Observable<ProductResponse> {
    return this.http.patch<ProductResponse>(`/api/products/${id}/status`, { status });
  }
  createPresentation(id: string, input: CreateProductPresentationRequest): Observable<ProductPresentationResponse> {
    return this.http.post<ProductPresentationResponse>(`/api/products/${id}/presentations`, input);
  }
  updatePresentation(
    id: string,
    presentationId: string,
    input: UpdateProductPresentationRequest
  ): Observable<ProductPresentationResponse> {
    return this.http.patch<ProductPresentationResponse>(`/api/products/${id}/presentations/${presentationId}`, input);
  }
  updatePresentationStatus(
    id: string,
    presentationId: string,
    status: ProductStatus
  ): Observable<ProductPresentationResponse> {
    return this.http.patch<ProductPresentationResponse>(
      `/api/products/${id}/presentations/${presentationId}/status`, { status }
    );
  }
}
