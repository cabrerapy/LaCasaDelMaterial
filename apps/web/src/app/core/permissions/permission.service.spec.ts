import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { hasPermission } from '@lcm/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { NAVIGATION_ITEMS } from '../navigation/navigation.config';
import { PermissionService } from './permission.service';

describe('PermissionService and navigation', () => {
  const currentUser = signal({
    id: 'user-id',
    name: 'Administrador',
    username: 'admin',
    email: 'admin@local',
    role: 'ADMIN' as const
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser } }]
    });
  });

  it('uses the centralized role matrix', () => {
    const service = TestBed.inject(PermissionService);
    expect(service.has('users.read')).toBe(true);
    currentUser.set({ ...currentUser(), role: 'CASHIER' });
    expect(service.has('users.read')).toBe(false);
    expect(service.has('sales.create')).toBe(true);
  });

  it('filters menu items according to permissions', () => {
    const cashierItems = NAVIGATION_ITEMS.filter((item) =>
      hasPermission('CASHIER', item.requiredPermission)
    );
    expect(cashierItems.some((item) => item.route === '/users')).toBe(false);
    expect(cashierItems.some((item) => item.route === '/sales')).toBe(true);
    expect(cashierItems.some((item) => item.route === '/reports')).toBe(true);
    expect(hasPermission('DRIVER', 'reports.read')).toBe(false);
    expect(hasPermission('CASHIER', 'reports.margin.read')).toBe(false);
  });
});
