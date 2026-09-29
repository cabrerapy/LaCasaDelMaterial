import { inject, Injectable, signal } from '@angular/core';
import type { AuthenticatedUserResponse } from '@lcm/contracts';
import { TokenStorageService } from './token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly userState = signal<AuthenticatedUserResponse | null>(null);
  readonly user = this.userState.asReadonly();

  get token(): string | null {
    return this.tokenStorage.get();
  }

  start(token: string, user: AuthenticatedUserResponse): void {
    this.tokenStorage.set(token);
    this.userState.set(user);
  }

  setUser(user: AuthenticatedUserResponse): void {
    this.userState.set(user);
  }

  clear(): void {
    this.tokenStorage.clear();
    this.userState.set(null);
  }
}
