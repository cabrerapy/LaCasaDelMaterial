import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryMovementResponse } from '@lcm/contracts';
import { InventoryApiService } from './inventory-api.service';
import { MovementsComponent } from './movements.component';
import { MovementDetailComponent } from './movement-detail.component';
import { movementQuantity, MOVEMENT_LABELS } from './movement-format';
import { ProductsApiService } from '../products/products-api.service';
import { PermissionService } from '../../core/permissions/permission.service';
import { routes } from '../../app.routes';

const movement: InventoryMovementResponse = { id: 'movement-id', movementNumber: 'MOV-2026-001', productId: 'arena-id',
  productSnapshot: { code: 'ARE', name: 'Arena', baseUnit: 'M3', quantityScale: 1000 }, lotId: 'lot-id', lotNumber: 'LOT-001',
  purchaseId: 'purchase-id', type: 'PURCHASE_RECEIPT', quantityDeltaInternal: 2500, sourceType: 'PURCHASE_RECEIPT',
  sourceId: 'receipt-id', sourceLineId: 'line-id', referenceNumber: 'REC-001', costGuarani: 100000,
  occurredAt: '2026-09-30T00:00:00.000Z', createdAt: '2026-09-30T12:00:00.000Z', createdBy: 'actor-id' };
describe('Inventory ledger UI', () => {
  const api = { list: vi.fn(), get: vi.fn() }; const products = { list: vi.fn() }; const permissions = { has: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); api.list.mockReturnValue(of({ items: [movement], nextToken: 'next-page' })); api.get.mockReturnValue(of(movement));
    products.list.mockReturnValue(of({ items: [] })); permissions.has.mockReturnValue(false);
    TestBed.configureTestingModule({ providers: [{ provide: InventoryApiService, useValue: api },
      { provide: ProductsApiService, useValue: products }, { provide: PermissionService, useValue: permissions },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => movement.id } } } }] });
  });
  function create() { return TestBed.runInInjectionContext(() => new MovementsComponent()); }
  it('formats scaled signed quantities and human-readable movement type', () => {
    expect(movementQuantity(movement)).toBe('+2,5 m³');
    expect(MOVEMENT_LABELS[movement.type]).toBe('Recepción de compra');
  });
  it('loads ledger, applies combined filters and resets pagination', () => {
    const component = create(); expect(component.items()).toEqual([movement]);
    component.next(); expect(api.list).toHaveBeenLastCalledWith({ pageSize: 25, nextToken: 'next-page' });
    component.form.patchValue({ productId: 'arena-id', type: 'PURCHASE_RECEIPT', dateFrom: '2026-09-01', dateTo: '2026-09-30', search: ' REC-001 ' });
    component.apply(); expect(component.page()).toBe(1);
    expect(api.list).toHaveBeenLastCalledWith({ pageSize: 25, productId: 'arena-id', type: 'PURCHASE_RECEIPT', dateFrom: '2026-09-01', dateTo: '2026-09-30', search: 'REC-001' });
  });
  it('rejects reversed dates without querying', () => {
    const component = create(); api.list.mockClear();
    component.form.patchValue({ dateFrom: '2026-10-01', dateTo: '2026-09-30' }); component.apply();
    expect(api.list).not.toHaveBeenCalled(); expect(component.error()).not.toBe('');
  });
  it('restricts costs in both listing and detail using the dedicated permission', () => {
    expect(create().canReadCosts).toBe(false);
    expect(TestBed.runInInjectionContext(() => new MovementDetailComponent()).canReadCosts).toBe(false);
    permissions.has.mockImplementation((permission: string) => permission === 'inventory.costs.read');
    expect(create().canReadCosts).toBe(true);
    const detail = TestBed.runInInjectionContext(() => new MovementDetailComponent());
    expect(detail.item()?.id).toBe(movement.id); expect(detail.canReadCosts).toBe(true);
  });
  it('guards listing and detail navigation with inventory.movements.read', () => {
    for (const path of ['inventory/movements', 'inventory/movements/:id']) {
      const route = routes.find((item) => item.path === path);
      expect(route?.data?.['permission']).toBe('inventory.movements.read'); expect(route?.canActivate?.length).toBe(2);
    }
  });
});
describe('Inventory API client', () => {
  it('sends filters and cursor to the read-only endpoint', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(InventoryApiService); const http = TestBed.inject(HttpTestingController);
    api.list({ productId: 'arena-id', search: 'REC', nextToken: 'cursor', pageSize: 10 }).subscribe();
    const request = http.expectOne((value) => value.url === '/api/inventory/movements');
    expect(request.request.method).toBe('GET'); expect(request.request.params.get('nextToken')).toBe('cursor');
    expect(request.request.params.get('productId')).toBe('arena-id'); request.flush({ items: [] }); http.verify();
  });
});
