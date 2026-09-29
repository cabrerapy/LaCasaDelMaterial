import { TestBed } from '@angular/core/testing';
import type { UserResponse, UsersPageResponse } from '@lcm/contracts';
import { of } from 'rxjs';
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
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usersApi.list.mockReturnValue(of(page));
    TestBed.configureTestingModule({
      providers: [{ provide: UsersApiService, useValue: usersApi }]
    });
    component = TestBed.runInInjectionContext(() => new UsersComponent());
  });

  it('loads the user listing', () => {
    expect(usersApi.list).toHaveBeenCalledWith(25, undefined);
    expect(component.users()).toEqual([admin]);
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
