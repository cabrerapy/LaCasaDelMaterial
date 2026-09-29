import { TestBed } from '@angular/core/testing';
import type { SupplierResponse, SuppliersPageResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../core/permissions/permission.service';
import { SuppliersApiService } from './suppliers-api.service';
import { SuppliersComponent } from './suppliers.component';

const supplier: SupplierResponse = {
  id: '28ea4d7d-e591-4679-9d89-293f54ff5682', businessName: 'Distribuidora Central S.A.',
  tradeName: 'Distribuidora Central', taxId: '80012345-6', phone: '0981 123456',
  email: 'ventas@distribuidora.local', city: 'Limpio', status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('SuppliersComponent', () => {
  let component: SuppliersComponent;
  const page: SuppliersPageResponse = { items: [supplier] };
  const api = { list: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() };
  const permissions = { has: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); api.list.mockReturnValue(of(page)); permissions.has.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: SuppliersApiService, useValue: api },
      { provide: PermissionService, useValue: permissions }
    ] });
    component = TestBed.runInInjectionContext(() => new SuppliersComponent());
  });

  it('lists active suppliers by default', () => {
    expect(api.list).toHaveBeenCalledWith({ pageSize: 25, status: 'ACTIVE' });
    expect(component.suppliers()).toEqual([supplier]);
  });
  it('applies status filters', () => {
    component.statusControl.setValue('INACTIVE');
    expect(api.list).toHaveBeenLastCalledWith({ pageSize: 25, status: 'INACTIVE' });
  });
  it('debounces supplier search', async () => {
    vi.useFakeTimers(); component.searchControl.setValue('central');
    await vi.advanceTimersByTimeAsync(350);
    expect(api.list).toHaveBeenLastCalledWith({ pageSize: 25, status: 'ACTIVE', search: 'central' });
    vi.useRealTimers();
  });
  it('derives actions from centralized permissions', () => {
    permissions.has.mockImplementation((permission: string) => permission === 'suppliers.read');
    const readOnly = TestBed.runInInjectionContext(() => new SuppliersComponent());
    expect(readOnly.canCreate).toBe(false); expect(readOnly.canUpdate).toBe(false); expect(readOnly.canDisable).toBe(false);
  });
  it('creates a valid supplier', () => {
    api.create.mockReturnValue(of(supplier)); component.openCreate();
    component.form.patchValue({ businessName: supplier.businessName, taxId: supplier.taxId, email: supplier.email });
    component.save();
    expect(api.create).toHaveBeenCalledWith({
      businessName: supplier.businessName, taxId: supplier.taxId, email: supplier.email
    });
    expect(component.successMessage()).toBe('Proveedor creado correctamente.');
  });
  it('edits and allows clearing optional fields', () => {
    api.update.mockReturnValue(of({ ...supplier, phone: undefined })); component.openEdit(supplier);
    component.form.patchValue({ tradeName: 'Central', phone: '' }); component.save();
    expect(api.update).toHaveBeenCalledWith(supplier.id, expect.objectContaining({ tradeName: 'Central', phone: '' }));
  });
  it('activates or deactivates through the confirmation flow', () => {
    api.updateStatus.mockReturnValue(of({ ...supplier, status: 'INACTIVE' }));
    component.requestStatusChange(supplier); component.confirmStatusChange();
    expect(api.updateStatus).toHaveBeenCalledWith(supplier.id, 'INACTIVE');
    expect(component.successMessage()).toBe('Proveedor desactivado correctamente.');
  });
});
