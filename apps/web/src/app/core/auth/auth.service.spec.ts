import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { LoginResponse } from '@lcm/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { COGNITO_LOGIN } from './cognito-login.token';
import { CognitoPkce } from './cognito-pkce';
import { firstValueFrom } from 'rxjs';

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
    expect(service.logout()).toBeNull();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });
});

describe('Cognito AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let cognito: CognitoPkce;
  beforeEach(() => {
    sessionStorage.clear();
    cognito = new CognitoPkce({ domain: 'https://offline.auth.us-east-1.amazoncognito.com', clientId: 'offline', redirectUri: 'https://app.example.invalid/auth/callback', logoutUri: 'https://app.example.invalid/login' }, sessionStorage);
    vi.spyOn(cognito, 'complete').mockResolvedValue('verified-by-backend-next');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: COGNITO_LOGIN, useValue: cognito }] });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('starts session only after backend me accepts access token', async () => {
    const completed = firstValueFrom(service.completeCognitoLogin('https://app.example.invalid/auth/callback?code=test'));
    await Promise.resolve();
    const request = http.expectOne('/api/auth/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer verified-by-backend-next');
    expect(service.isAuthenticated()).toBe(false);
    request.flush(loginResponse.user);
    await completed;
    expect(service.currentUser()?.role).toBe('ADMIN');
    expect(service.isAuthenticated()).toBe(true);
    http.verify();
  });

  it('does not persist Cognito token when backend rejects inactive or unlinked user', async () => {
    const completed = firstValueFrom(service.completeCognitoLogin('callback'));
    const rejected = expect(completed).rejects.toBeDefined();
    await Promise.resolve();
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(service.isAuthenticated()).toBe(false);
    http.verify();
  });

  it('blocks local password endpoint in Cognito mode', async () => {
    await expect(firstValueFrom(service.login({ username: 'admin', password: 'unused' }))).rejects.toThrow('Local login disabled');
    http.expectNone('/api/auth/login');
  });

  it('clears token and user before handing off Hosted UI logout', async () => {
    const completed = firstValueFrom(service.completeCognitoLogin('callback'));
    await Promise.resolve();
    http.expectOne('/api/auth/me').flush(loginResponse.user);
    await completed;
    const logoutUrl = service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(sessionStorage.getItem('lcm.accessToken')).toBeNull();
    expect(new URL(logoutUrl!).pathname).toBe('/logout');
    http.verify();
  });
});
