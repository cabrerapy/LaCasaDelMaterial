import type { UserRole } from '@lcm/contracts';

export interface AuthenticatedUser {
  readonly userId: string;
  readonly role: UserRole;
}

export interface AuthenticationProvider {
  readonly supportsPasswordLogin?: boolean;
  createToken(user: AuthenticatedUser): string;
  authenticate(authorizationHeader: string | undefined): AuthenticatedUser | Promise<AuthenticatedUser>;
}
