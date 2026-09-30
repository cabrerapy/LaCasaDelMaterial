import { TestBed } from '@angular/core/testing';
import type { PurchaseResponse, SupplierResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../core/permissions/permission.service';
import { SuppliersApiService } from '../suppliers/suppliers-api.service';
import { PurchasesApiService } from './purchases-api.service';
import { PurchasesComponent } from './purchases.component';

const supplier: SupplierResponse = {
  id: '3ae577d3-c738-4b89-9db0-3daf2e511c40', businessName: 'Distribuidora Central', status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
};
const purchase: PurchaseResponse = {
  id: '4d80226d-15f4-419e-ae40-44e2b7561004', purchaseNumber: 'CMP-2026-ABCDEF12', supplierId: supplier.id,
  supplierSnapshot: { businessName: supplier.businessName }, purchaseDate: '2026-09-29', status: 'DRAFT', items: [],
  subtotalGuarani: 0, discountGuarani: 0, additionalCostsGuarani: 0, totalGuarani: 0,
  createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z'
};

describe('PurchasesComponent', () => {
  let component: PurchasesComponent;
  const api = { list: vi.fn() }; const suppliersApi = { list: vi.fn() }; const permissions = { has: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); api.list.mockReturnValue(of({ items: [purchase] }));
    suppliersApi.list.mockReturnValue(of({ items: [supplier] })); permissions.has.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: PurchasesApiService, useValue: api }, { provide: SuppliersApiService, useValue: suppliersApi },
      { provide: PermissionService, useValue: permissions }
    ] });
    component = TestBed.runInInjectionContext(() => new PurchasesComponent());
  });
  it('loads purchase history and bounded active suppliers', () => {
    expect(api.list).toHaveBeenCalledWith({ pageSize: 25 });
    expect(suppliersApi.list).toHaveBeenCalledWith({ pageSize: 100, status: 'ACTIVE' });
    expect(component.purchases()).toEqual([purchase]);
  });
  it('applies supplier, status and date filters', () => {
    component.supplierControl.setValue(supplier.id); component.statusControl.setValue('CONFIRMED');
    component.dateFromControl.setValue('2026-09-01'); component.dateToControl.setValue('2026-09-30');
    expect(api.list).toHaveBeenLastCalledWith({
      pageSize: 25, supplierId: supplier.id, status: 'CONFIRMED', dateFrom: '2026-09-01', dateTo: '2026-09-30'
    });
  });
  it('derives creation, editing and cost visibility from permissions', () => {
    permissions.has.mockImplementation((permission: string) => permission === 'purchases.read');
    const readOnly = TestBed.runInInjectionContext(() => new PurchasesComponent());
    expect(readOnly.canCreate).toBe(false); expect(readOnly.canUpdate).toBe(false); expect(readOnly.canReadCosts).toBe(false);
  });
});
