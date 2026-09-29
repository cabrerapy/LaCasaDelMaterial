import { TestBed } from '@angular/core/testing';
import type { ProductCategoryResponse, ProductResponse, ProductsPageResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { displayToInternal, internalToDisplay } from '../../shared/quantity';
import { CategoriesApiService } from '../categories/categories-api.service';
import { ProductsApiService } from './products-api.service';
import { ProductsComponent } from './products.component';

const category: ProductCategoryResponse = {
  id: '6a7c98fb-6648-41d1-8bb6-490c1937fd56', name: 'Arena', slug: 'arena',
  status: 'ACTIVE', sortOrder: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
};
const product: ProductResponse = {
  id: 'c004eafe-d85a-41af-9db5-2ea155e8a96d', code: 'ARENA-LAV', name: 'Arena lavada',
  category: { id: category.id, name: category.name }, baseUnit: 'M3', quantityScale: 1000,
  minStock: 5.5, trackStock: true, status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z', presentations: [{
    id: '20731cba-3564-4793-897c-f600b9294b60', productId: 'c004eafe-d85a-41af-9db5-2ea155e8a96d',
    name: '0,5 m³', sku: 'ARENA-LAV-05', baseQuantity: 0.5, salePriceGuarani: 90000,
    isDefault: true, status: 'ACTIVE', sortOrder: 10,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }]
};

describe('ProductsComponent', () => {
  let component: ProductsComponent;
  const productPage: ProductsPageResponse = { items: [product] };
  const api = {
    list: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn(),
    createPresentation: vi.fn(), updatePresentation: vi.fn(), updatePresentationStatus: vi.fn()
  };
  const categoriesApi = { list: vi.fn() };
  const permissions = { has: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks(); api.list.mockReturnValue(of(productPage));
    categoriesApi.list.mockReturnValue(of({ items: [category] })); permissions.has.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: ProductsApiService, useValue: api },
      { provide: CategoriesApiService, useValue: categoriesApi },
      { provide: PermissionService, useValue: permissions }
    ] });
    component = TestBed.runInInjectionContext(() => new ProductsComponent());
  });

  it('loads active products and active categories by default', () => {
    expect(api.list).toHaveBeenCalledWith({ pageSize: 25, status: 'ACTIVE' });
    expect(categoriesApi.list).toHaveBeenCalledWith({ pageSize: 100, status: 'ACTIVE' });
    expect(component.products()).toEqual([product]);
  });

  it('derives actions from centralized permissions', () => {
    permissions.has.mockImplementation((permission: string) => permission === 'products.read');
    const readOnly = TestBed.runInInjectionContext(() => new ProductsComponent());
    expect(readOnly.canCreate).toBe(false); expect(readOnly.canUpdate).toBe(false);
    expect(readOnly.canDisable).toBe(false); expect(readOnly.canManagePrices).toBe(false);
  });

  it('filters by category and status', () => {
    component.categoryControl.setValue(category.id);
    component.statusControl.setValue('INACTIVE');
    expect(api.list).toHaveBeenLastCalledWith({ pageSize: 25, categoryId: category.id, status: 'INACTIVE' });
  });

  it('creates an M3 product with dynamic presentations and one default', () => {
    api.create.mockReturnValue(of(product)); component.openCreate();
    component.form.patchValue({
      code: 'ARENA-LAV', name: 'Arena lavada', categoryId: category.id,
      baseUnit: 'M3', quantityScale: 1000, minStock: 5.5, trackStock: true
    });
    component.presentations.at(0).patchValue({
      name: '0,5 m³', sku: 'ARENA-LAV-05', baseQuantity: 0.5,
      salePriceGuarani: 90000, isDefault: true, sortOrder: 10
    });
    component.addPresentation();
    component.presentations.at(1).patchValue({
      name: '1 m³', sku: 'ARENA-LAV-1', baseQuantity: 1,
      salePriceGuarani: 175000, isDefault: false, sortOrder: 20
    });
    component.save();
    const payload = api.create.mock.calls[0]?.[0];
    expect(payload.presentations).toHaveLength(2);
    expect(payload.presentations[0].baseQuantity).toBe(0.5);
    expect(payload.presentations.filter((item: { isDefault: boolean }) => item.isDefault)).toHaveLength(1);
  });

  it('proposes scale 1000 for M3 and scale 1 for BAG', () => {
    component.openCreate(); component.unitChanged('M3');
    expect(component.form.controls.quantityScale.value).toBe(1000);
    component.unitChanged('BAG'); expect(component.form.controls.quantityScale.value).toBe(1);
  });

  it('keeps exactly one default presentation in the form', () => {
    component.openCreate(); component.addPresentation(); component.selectDefault(1);
    expect(component.presentations.at(0).controls.isDefault.value).toBe(false);
    expect(component.presentations.at(1).controls.isDefault.value).toBe(true);
  });
});

describe('product presentation helpers', () => {
  it('converts scaled quantities in both directions', () => {
    expect(displayToInternal(0.5, 1000)).toBe(500);
    expect(displayToInternal(2.75, 1000)).toBe(2750);
    expect(internalToDisplay(500, 1000)).toBe(0.5);
  });
  it('formats integer guaranies without changing the stored value', () => {
    const value = 65000;
    expect(new GuaraniPipe().transform(value)).toBe('Gs. 65.000');
    expect(value).toBe(65000);
  });
});
