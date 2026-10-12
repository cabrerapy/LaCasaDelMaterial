import { TestBed } from '@angular/core/testing';
import type { UserResponse, UsersPageResponse } from '@lcm/contracts';
import { of, throwError, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersApiService } from './users-api.service';
import { UsersComponent } from './users.component';

const admin: UserResponse = {
  id: 'admin-id',
  name: 'Administrador',
  username: 'admin',
  email: 'admin@local',
  role: 'ADMIN',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('UsersComponent', () => {
  let component: UsersComponent;
  const page: UsersPageResponse = { items: [admin] };
  const usersApi = {
    capabilities: vi.fn(),
    stageCognito: vi.fn(),
    inviteCognito: vi.fn(),
    activateCognito: vi.fn(),
    deactivateCognito: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usersApi.list.mockReturnValue(of(page));
    usersApi.capabilities.mockReturnValue(of({ mode: 'local', create: true, invite: false, activate: false, edit: true, status: true, deactivate: false }));
    TestBed.configureTestingModule({
      providers: [{ provide: UsersApiService, useValue: usersApi }]
    });
    component = TestBed.runInInjectionContext(() => new UsersComponent());
  });

  it('loads the user listing', () => {
    expect(usersApi.list).toHaveBeenCalledWith(25, undefined);
    expect(component.users()).toEqual([admin]);
  });

  it('requires a deactivation reason and does not use the local status endpoint', () => {
    component.capabilities.set({ mode: 'cognito', create: true, invite: true, activate: true, edit: false, status: false, deactivate: true });
    const target = { ...admin, id: 'cashier', role: 'CASHIER' as const };
    usersApi.deactivateCognito.mockReturnValue(of({ userId: target.id, status: 'INACTIVE' }));
    component.requestLifecycle(target, 'deactivate');
    expect(usersApi.deactivateCognito).not.toHaveBeenCalled();
    component.confirmLifecycle();
    expect(component.errorMessage()).toContain('motivo');
    expect(usersApi.deactivateCognito).not.toHaveBeenCalled();
    component.deactivationReason = ' Cambio de personal ';
    component.confirmLifecycle();
    expect(usersApi.deactivateCognito).toHaveBeenCalledWith(target.id, 'Cambio de personal');
    expect(usersApi.updateStatus).not.toHaveBeenCalled();
    expect(component.feedback()).toContain('procedimiento separado');
  });

  it('protects administrators and does not offer activation or invitation after recorded deactivation', () => {
    component.capabilities.set({ mode: 'cognito', create: true, invite: true, activate: true, edit: false, status: false, deactivate: true });
    component.requestLifecycle(admin, 'deactivate');
    expect(component.lifecycleTarget()).toBeNull();
    const target = { ...admin, role: 'CASHIER' as const, status: 'INACTIVE' as const, cognitoDeactivated: true };
    component.requestLifecycle(target, 'activate');
    component.requestLifecycle(target, 'invite');
    expect(component.lifecycleTarget()).toBeNull();
  });

  it('refreshes the actual state and warns about a partial deactivation failure', () => {
    component.capabilities.set({ mode: 'cognito', create: true, invite: true, activate: true, edit: false, status: false, deactivate: true });
    const target = { ...admin, id: 'cashier', role: 'CASHIER' as const };
    usersApi.deactivateCognito.mockReturnValue(throwError(() => ({ error: { message: 'Reconciliación pendiente' } })));
    usersApi.list.mockReturnValue(of({ items: [{ ...target, status: 'INACTIVE', cognitoDeactivated: true }] }));
    component.requestLifecycle(target, 'deactivate');
    component.deactivationReason = 'Cambio de personal';
    component.confirmLifecycle();
    expect(component.users()[0]?.status).toBe('INACTIVE');
    expect(component.errorMessage()).toContain('puede haber quedado bloqueado');
    expect(component.saving()).toBe(false);
    expect(usersApi.updateStatus).not.toHaveBeenCalled();
  });

  it('Cognito creates without sending password or invoking local mutations', () => {
    component.capabilities.set({ mode: 'cognito', create: true, invite: true, activate: true, edit: false, status: false, deactivate: true });
    usersApi.stageCognito.mockReturnValue(of({ userId: 'qa-id', status: 'INACTIVE' }));
    component.openCreate();
    component.form.patchValue({ name: 'Caja', username: 'caja', email: 'qa@example.invalid', role: 'CASHIER', password: 'MustNotBeSent123!' });
    expect(component.form.controls.password.disabled).toBe(true);
    component.save();
    expect(usersApi.stageCognito).toHaveBeenCalledWith({ name: 'Caja', username: 'caja', email: 'qa@example.invalid', role: 'CASHIER' });
    expect(usersApi.create).not.toHaveBeenCalled();
    component.openEdit(admin);
    component.requestStatusChange(admin);
    component.confirmStatusChange();
    expect(usersApi.updateStatus).not.toHaveBeenCalled();
    expect(component.formMode()).toBeNull();
  });

  it('keeps actions blocked when capabilities fail or lifecycle is disabled', () => {
    component.capabilities.set(null);
    component.openCreate();
    component.requestLifecycle({ ...admin, status: 'INACTIVE' }, 'invite');
    component.save();
    expect(component.formMode()).toBeNull();
    expect(component.lifecycleTarget()).toBeNull();
    expect(usersApi.stageCognito).not.toHaveBeenCalled();
    usersApi.capabilities.mockReturnValue(throwError(() => new Error('unavailable')));
    const blocked = TestBed.runInInjectionContext(() => new UsersComponent());
    expect(blocked.capabilities()).toBeNull();
    expect(blocked.errorMessage()).toContain('solo lectura');
  });

  it('requires confirmation and prevents concurrent invitation clicks', () => {
    component.capabilities.set({ mode: 'cognito', create: true, invite: true, activate: true, edit: false, status: false, deactivate: true });
    const request = new Subject<{ userId: string; status: 'INACTIVE'; invitation: 'REQUESTED' }>();
    usersApi.inviteCognito.mockReturnValue(request);
    component.requestLifecycle({ ...admin, status: 'INACTIVE' }, 'invite');
    expect(usersApi.inviteCognito).not.toHaveBeenCalled();
    component.confirmLifecycle();
    component.confirmLifecycle();
    expect(usersApi.inviteCognito).toHaveBeenCalledTimes(1);
    component.cancelLifecycle();
    expect(component.lifecycleTarget()).not.toBeNull();
    request.next({ userId: admin.id, status: 'INACTIVE', invitation: 'REQUESTED' });
    request.complete();
    expect(component.feedback()).toContain('no confirma');
    expect(component.lifecycleTarget()).toBeNull();
    expect(component.saving()).toBe(false);
  });

  it('activates separately and shows server rejection without local status mutation', () => {
    component.capabilities.set({ mode: 'cognito', create: true, invite: true, activate: true, edit: false, status: false, deactivate: true });
    usersApi.activateCognito.mockReturnValue(throwError(() => ({ error: { message: 'Identidad no confirmada' } })));
    component.requestLifecycle({ ...admin, status: 'INACTIVE' }, 'activate');
    component.confirmLifecycle();
    expect(component.errorMessage()).toBe('Identidad no confirmada');
    expect(component.saving()).toBe(false);
    expect(usersApi.updateStatus).not.toHaveBeenCalled();
  });

  it('creates a user with valid form data', () => {
    const created: UserResponse = {
      ...admin,
      id: 'cashier-id',
      name: 'Caja',
      username: 'caja',
      email: 'caja@local',
      role: 'CASHIER'
    };
    usersApi.create.mockReturnValue(of(created));
    component.openCreate();
    component.form.setValue({
      name: 'Caja',
      username: 'caja',
      email: 'caja@local',
      password: 'Password123',
      role: 'CASHIER'
    });
    component.save();

    expect(usersApi.create).toHaveBeenCalled();
    expect(component.formMode()).toBeNull();
  });
});
