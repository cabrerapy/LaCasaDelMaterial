import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AuthenticatedUserResponse,
  LoginRequest,
  LoginResponse
} from '@lcm/contracts';
import { type Observable, of, tap } from 'rxjs';
import { AuthSessionService } from './auth-session.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSessionService);
  readonly currentUser = this.session.user;

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', credentials).pipe(
      tap((response) => this.session.start(response.accessToken, response.user))
    );
  }

  logout(): void {
    this.session.clear();
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
