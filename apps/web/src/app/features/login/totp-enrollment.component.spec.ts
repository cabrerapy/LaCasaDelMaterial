import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { COGNITO_ENROLLMENT } from '../../core/auth/cognito-enrollment.token';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { TotpEnrollmentComponent } from './totp-enrollment.component';

afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); history.replaceState(null, '', '/'); });
it('configures MFA without starting a commercial session and clears secrets', async () => {
  const session = { clear: vi.fn(), start: vi.fn() };
  const client = { complete: vi.fn().mockResolvedValue('isolated-token'), cancel: vi.fn() };
  TestBed.configureTestingModule({ providers: [
    { provide: AuthSessionService, useValue: session }, { provide: COGNITO_ENROLLMENT, useValue: client }
  ] });
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ secretCode: 'ABCDEFGHIJKLMNOP' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'MFA_CONFIGURED_NOT_ACTIVE' })));
  vi.stubGlobal('fetch', fetcher);
  history.replaceState(null, '', '/auth/enrollment/callback?code=test&state=test');
  const component = TestBed.runInInjectionContext(() => new TotpEnrollmentComponent());
  await component.ngOnInit();
  expect(location.search).toBe('');
  expect(component.secret()).toBe('ABCDEFGHIJKLMNOP');
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', cache: 'no-store',
    headers: { Authorization: 'Bearer isolated-token' } });
  component.code = '123456'; await component.complete();
  expect(component.done()).toBe(true); expect(component.secret()).toBe('');
  expect(component.code).toBe(''); expect(session.start).not.toHaveBeenCalled();
  component.ngOnDestroy(); expect(client.cancel).toHaveBeenCalled();
});
it('disabled enrollment clears commercial session without requests', async () => {
  const clear = vi.fn();
  TestBed.configureTestingModule({ providers: [{ provide: AuthSessionService, useValue: { clear } }] });
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const component = TestBed.runInInjectionContext(() => new TotpEnrollmentComponent());
  await component.ngOnInit(); await component.begin(); await component.complete();
  expect(clear).toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled(); component.ngOnDestroy();
});

it('recovers an existing authenticator and retries partial confirmation without commercial access', async () => {
  const session = { clear: vi.fn(), start: vi.fn() };
  const client = { complete: vi.fn().mockResolvedValue('isolated-token'), cancel: vi.fn() };
  TestBed.configureTestingModule({ providers: [
    { provide: AuthSessionService, useValue: session }, { provide: COGNITO_ENROLLMENT, useValue: client }
  ] });
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('{}', { status: 409 }))
    .mockResolvedValueOnce(new Response('{}', { status: 500 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'MFA_CONFIGURED_NOT_ACTIVE' })));
  vi.stubGlobal('fetch', fetcher);
  history.replaceState(null, '', '/auth/enrollment/callback?code=test&state=test');
  const component = TestBed.runInInjectionContext(() => new TotpEnrollmentComponent());
  await component.ngOnInit();
  expect(component.alreadyEnabled()).toBe(true); expect(component.secret()).toBe('');
  component.code = '123456'; await component.complete();
  expect(component.done()).toBe(false); expect(component.code).toBe('');
  component.code = '654321'; await component.complete();
  expect(component.done()).toBe(true); expect(component.alreadyEnabled()).toBe(false);
  expect(session.start).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([
    '/api/auth/enrollment/totp/begin', '/api/auth/enrollment/totp/complete', '/api/auth/enrollment/totp/complete'
  ]);
  component.ngOnDestroy();
});
