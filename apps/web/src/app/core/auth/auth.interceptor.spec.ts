import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { expect, it } from 'vitest';
import { authInterceptor } from './auth.interceptor';

it('sends access token only to relative application API, never external identity endpoints', () => {
  sessionStorage.setItem('lcm.accessToken', 'private-token');
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpClient);
  const controller = TestBed.inject(HttpTestingController);
  for (const url of ['/api/auth/me', 'https://identity.example.invalid/oauth2/token', '/assets/config.json']) {
    http.get(url).subscribe();
    const request = controller.expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe(url.startsWith('/api/') ? 'Bearer private-token' : null);
    request.flush({});
  }
  controller.verify();
  sessionStorage.clear();
});
