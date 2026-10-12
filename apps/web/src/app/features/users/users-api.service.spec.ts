import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsersApiService } from './users-api.service';

describe('Cognito users API', () => {
  let service: UsersApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(UsersApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('deactivates through the coordinated Cognito endpoint with a reason', async () => {
    const result = firstValueFrom(service.deactivateCognito('qa-id', 'Cambio de personal'));
    const request = http.expectOne('/api/users/cognito/qa-id/deactivation');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ reason: 'Cambio de personal' });
    request.flush({ userId: 'qa-id', status: 'INACTIVE' });
    expect((await result).status).toBe('INACTIVE');
  });
  it('loads backend capabilities rather than guessing from authentication mode', async () => {
    const result = firstValueFrom(service.capabilities());
    const capabilities = { mode: 'cognito', create: false, invite: false, activate: false, edit: false, status: false, deactivate: false };
    http.expectOne('/api/users/capabilities').flush(capabilities);
    expect(await result).toEqual(capabilities);
  });
  it('never serializes a password when staging a Cognito user', async () => {
    const input = { name: 'QA', username: 'qa.user', email: 'qa@example.invalid', role: 'CASHIER' as const, password: 'MustNotBeSent123!' };
    const result = firstValueFrom(service.stageCognito(input));
    const request = http.expectOne('/api/users/cognito');
    expect(request.request.body).toEqual({ name: input.name, username: input.username, email: input.email, role: input.role });
    request.flush({ userId: 'qa-id', status: 'INACTIVE' });
    expect(await result).toEqual({ userId: 'qa-id', status: 'INACTIVE' });
  });
  it('sends separate invitation and activation requests with empty bodies', async () => {
    const invite = firstValueFrom(service.inviteCognito('qa-id'));
    const invitation = http.expectOne('/api/users/cognito/qa-id/invitation');
    expect(invitation.request.body).toEqual({});
    invitation.flush({ userId: 'qa-id', status: 'INACTIVE', invitation: 'REQUESTED' });
    expect((await invite).status).toBe('INACTIVE');
    const activate = firstValueFrom(service.activateCognito('qa-id'));
    const activation = http.expectOne('/api/users/cognito/qa-id/activation');
    expect(activation.request.body).toEqual({});
    activation.flush({ userId: 'qa-id', status: 'ACTIVE' });
    expect((await activate).status).toBe('ACTIVE');
  });
});
