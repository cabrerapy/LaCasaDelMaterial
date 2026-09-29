import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('authGuard', () => {
  const auth = {
    isAuthenticated: vi.fn(),
    getCurrentUser: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }]
    });
  });

  it('redirects users without a token to login', () => {
    auth.isAuthenticated.mockReturnValue(false);
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('allows a valid authenticated user', async () => {
    auth.isAuthenticated.mockReturnValue(true);
    auth.getCurrentUser.mockReturnValue(of({ id: 'user-id' }));
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    await expect(firstValueFrom(result as Observable<boolean | UrlTree>)).resolves.toBe(true);
  });
});
