import { Injectable } from '@angular/core';

const ACCESS_TOKEN_KEY = 'lcm.accessToken';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  get(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  set(token: string): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  }

  clear(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}
