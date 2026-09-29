import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { PermissionService } from './permission.service';
import { permissionGuard } from './permission.guard';

describe('permissionGuard', () => {
  const auth = { currentUser: signal({ id: 'cashier' }), getCurrentUser: vi.fn() };
  const permissions = { has: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: PermissionService, useValue: permissions }
      ]
    });
  });

  it('redirects an authenticated user without permission to forbidden', () => {
    permissions.has.mockReturnValue(false);
    const result = TestBed.runInInjectionContext(() => permissionGuard(
      { data: { permission: 'users.read' } } as never,
      {} as never
    ));
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/forbidden');
  });

  it('allows an authenticated user with permission', () => {
    permissions.has.mockReturnValue(true);
    const result = TestBed.runInInjectionContext(() => permissionGuard(
      { data: { permission: 'users.read' } } as never,
      {} as never
    ));
    expect(result).toBe(true);
  });
});
