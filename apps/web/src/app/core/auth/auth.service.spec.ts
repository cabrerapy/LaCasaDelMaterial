import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { LoginResponse } from '@lcm/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';

const loginResponse: LoginResponse = {
  accessToken: 'test-token',
  user: {
    id: 'user-id',
    name: 'Administrador',
    username: 'admin',
    email: 'admin@lacasadelmaterial.local',
    role: 'ADMIN'
  }
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('logs in and centralizes the token and user session', () => {
    service.login({ username: 'admin', password: 'secret' }).subscribe();
    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    request.flush(loginResponse);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.username).toBe('admin');
  });

  it('loads the current authenticated user', () => {
    sessionStorage.setItem('lcm.accessToken', 'test-token');
    service.getCurrentUser().subscribe();
    const request = http.expectOne('/api/auth/me');
    request.flush(loginResponse.user);

    expect(service.currentUser()?.role).toBe('ADMIN');
  });

  it('clears the local session on logout', () => {
    service.login({ username: 'admin', password: 'secret' }).subscribe();
    http.expectOne('/api/auth/login').flush(loginResponse);
    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });
});
