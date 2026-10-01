import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { routes } from '../../app.routes';
import { CustomersApiService } from './customers-api.service';
import { CustomersComponent } from './customers.component';
const person: CustomerResponse = { id: 'id', type: 'PERSON', firstName: 'Juan', lastName: 'Pérez', displayName: 'Juan Pérez',
  documentType: 'CI', documentNumber: '123', phone: '0981', status: 'ACTIVE', createdAt: '2026-10-01', updatedAt: '2026-10-01' };
describe('Customers UI', () => {
  const api = { list: vi.fn(), create: vi.fn(), update: vi.fn(), status: vi.fn() }; const permissions = { has: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); api.list.mockReturnValue(of({ items: [person] })); api.create.mockReturnValue(of(person));
    api.update.mockReturnValue(of(person)); api.status.mockReturnValue(of({ ...person, status: 'INACTIVE' }));
    permissions.has.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [{ provide: CustomersApiService, useValue: api }, { provide: PermissionService, useValue: permissions }] });
  });
  it('loads, searches and filters customers', () => {
    const component = TestBed.runInInjectionContext(() => new CustomersComponent()); expect(component.items()[0]?.displayName).toBe('Juan Pérez');
    component.search.setValue('Juan'); component.typeFilter.setValue('PERSON');
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Juan', type: 'PERSON', status: 'ACTIVE' }));
  });
  it('creates PERSON and COMPANY with dynamic payloads', () => {
    const component = TestBed.runInInjectionContext(() => new CustomersComponent()); component.openCreate();
    component.form.patchValue({ type: 'PERSON', firstName: 'Ana', documentType: 'CI', documentNumber: '2' }); component.save();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'PERSON', firstName: 'Ana' }));
    component.openCreate(); component.form.patchValue({ type: 'COMPANY', businessName: 'Empresa SA' }); component.save();
    expect(api.create).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'COMPANY', businessName: 'Empresa SA' }));
  });
  it('edits without type and changes status according to permissions', () => {
    const component = TestBed.runInInjectionContext(() => new CustomersComponent()); component.openEdit(person);
    component.form.patchValue({ phone: '0991' }); component.save();
    expect(api.update).toHaveBeenCalledWith('id', expect.not.objectContaining({ type: expect.anything() }));
    component.requestStatus(person); component.confirmStatus(); expect(api.status).toHaveBeenCalledWith('id', 'INACTIVE');
    expect(component.canCreate).toBe(true); expect(component.canDisable).toBe(true);
  });
  it('guards navigation and API uses expected endpoints', () => {
    const route = routes.find((item) => item.path === 'customers'); expect(route?.data?.['permission']).toBe('customers.read');
    TestBed.resetTestingModule(); TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const client = TestBed.inject(CustomersApiService); const http = TestBed.inject(HttpTestingController);
    client.list({ search: 'Juan', status: 'ACTIVE' }).subscribe();
    const list = http.expectOne((request) => request.url === '/api/customers'); expect(list.request.method).toBe('GET'); list.flush({ items: [] });
    client.status('id', 'INACTIVE').subscribe(); expect(http.expectOne('/api/customers/id/status').request.method).toBe('PATCH');
  });
});
