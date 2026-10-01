import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockDetailResponse, StockResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { CategoriesApiService } from '../categories/categories-api.service';
import { routes } from '../../app.routes';
import { StockApiService } from './stock-api.service';
import { StockComponent } from './stock.component';
import { StockDetailComponent } from './stock-detail.component';
import { currentStock, stockQuantity, STOCK_LABELS } from './stock-format';

const row: StockResponse = { productId: '11111111-1111-4111-8111-111111111111', code: 'ARE', name: 'Arena',
  productStatus: 'ACTIVE', category: { id: '22222222-2222-4222-8222-222222222222', name: 'Áridos' },
  baseUnit: 'M3', quantityScale: 1000, trackStock: true, onHandInternal: 7250, minStockInternal: 10000,
  shortageInternal: 2750, stockStatus: 'LOW_STOCK', defaultPresentation: null, lastMovementAt: null };
const detail: StockDetailResponse = { ...row, presentations: [], recentMovements: [], lastReceipt: null };
describe('Stock UI', () => {
  const api = { list: vi.fn(), detail: vi.fn(), summary: vi.fn() };
  const categories = { list: vi.fn() }; const permissions = { has: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); api.list.mockReturnValue(of({ items: [row], nextToken: 'next' }));
    api.detail.mockReturnValue(of(detail)); api.summary.mockReturnValue(of({ totalTrackedProducts: 1, okProducts: 0, lowStockProducts: 1, outOfStockProducts: 0, notTrackedProducts: 0 }));
    categories.list.mockReturnValue(of({ items: [] })); permissions.has.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: StockApiService, useValue: api }, { provide: CategoriesApiService, useValue: categories },
      { provide: PermissionService, useValue: permissions },
      { provide: ActivatedRoute, useValue: { paramMap: of({ get: () => row.productId }) } }
    ] });
  });
  it('formats scaled, minimum and shortage quantities and friendly states', () => {
    expect(stockQuantity(7250, 1000, 'M3')).toBe('7,25 m³');
    expect(currentStock(row)).toBe('7,25 m³'); expect(STOCK_LABELS.LOW_STOCK).toBe('Stock bajo');
    expect(currentStock({ ...row, trackStock: false, stockStatus: 'NOT_TRACKED' })).toBe('No controlado');
  });
  it('loads summary/list, applies filters and paginates', () => {
    const component = TestBed.runInInjectionContext(() => new StockComponent());
    expect(component.items()[0]?.productId).toBe(row.productId); expect(component.summary()?.lowStockProducts).toBe(1);
    component.form.patchValue({ search: ' ARE ', categoryId: row.category.id, stockStatus: 'LOW_STOCK' }); component.apply();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'ARE', categoryId: row.category.id, stockStatus: 'LOW_STOCK' }));
    component.next(); expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ nextToken: 'next' }));
  });
  it('loads detail and guards stock routes with inventory.read', () => {
    const component = TestBed.runInInjectionContext(() => new StockDetailComponent());
    expect(component.item()?.onHandInternal).toBe(7250);
    for (const path of ['inventory', 'inventory/:productId']) {
      const route = routes.find((item) => item.path === path);
      expect(route?.data?.['permission']).toBe('inventory.read'); expect(route?.canActivate?.length).toBe(2);
    }
  });
});
describe('Stock API client', () => {
  it('uses read-only stock, summary and detail endpoints', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(StockApiService); const http = TestBed.inject(HttpTestingController);
    api.list({ stockStatus: 'LOW_STOCK', pageSize: 10 }).subscribe();
    const list = http.expectOne((request) => request.url === '/api/inventory/stock'); expect(list.request.method).toBe('GET');
    expect(list.request.params.get('stockStatus')).toBe('LOW_STOCK'); list.flush({ items: [] });
    api.summary().subscribe(); http.expectOne('/api/inventory/summary').flush({});
    api.detail(row.productId).subscribe(); http.expectOne(`/api/inventory/stock/${row.productId}`).flush(detail); http.verify();
  });
});
