import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AuthenticatedUserResponse,
  LoginRequest,
  LoginResponse
} from '@lcm/contracts';
import { type Observable, defer, from, map, of, switchMap, tap, throwError } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { COGNITO_LOGIN } from './cognito-login.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  private readonly cognito = inject(COGNITO_LOGIN);
  readonly usesCognito = this.cognito !== null;
  readonly currentUser = this.session.user;

  login(credentials: LoginRequest): Observable<LoginResponse> {
    if (this.cognito) return throwError(() => new Error('Local login disabled in Cognito mode'));
    return this.http.post<LoginResponse>('/api/auth/login', credentials).pipe(
      tap((response) => this.session.start(response.accessToken, response.user))
    );
  }

  beginCognitoLogin(): Promise<string> {
    if (!this.cognito) return Promise.reject(new Error('Cognito is not configured'));
    this.session.clear();
    return this.cognito.begin();
  }

  completeCognitoLogin(callbackUrl: string): Observable<LoginResponse> {
    const cognito = this.cognito;
    if (!cognito) return throwError(() => new Error('Cognito is not configured'));
    return defer(() => {
      this.session.clear();
      return from(cognito.complete(callbackUrl));
    }).pipe(switchMap(accessToken => this.http.get<AuthenticatedUserResponse>('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).pipe(map(user => ({ accessToken, user })))),
    tap(response => this.session.start(response.accessToken, response.user)));
  }

  logout(): string | null {
    this.cognito?.cancel();
    this.session.clear();
    return this.cognito?.logoutUrl() ?? null;
  }

  getCurrentUser(): Observable<AuthenticatedUserResponse | null> {
    if (!this.session.token) {
      return of(null);
    }
    return this.http.get<AuthenticatedUserResponse>('/api/auth/me').pipe(
      tap((user) => this.session.setUser(user))
    );
  }

  isAuthenticated(): boolean {
    return this.session.token !== null;
  }
}
