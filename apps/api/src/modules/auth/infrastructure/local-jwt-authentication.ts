import { USER_ROLES, type UserRole } from '@lcm/contracts';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type {
  AuthenticatedUser,
  AuthenticationProvider
} from '../domain/authenticated-user.js';
import { AuthenticationError } from '../domain/authentication-error.js';

export class LocalJwtAuthentication implements AuthenticationProvider {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string
  ) {}

  createToken(user: AuthenticatedUser): string {
    return jwt.sign(
      { role: user.role },
      this.secret,
      {
        subject: user.userId,
        expiresIn: this.expiresIn as NonNullable<SignOptions['expiresIn']>
      }
    );
  }

  authenticate(authorizationHeader: string | undefined): AuthenticatedUser {
    const [scheme, token] = authorizationHeader?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new AuthenticationError();
    }

    try {
      const payload = jwt.verify(token, this.secret) as JwtPayload;
      if (
        typeof payload.sub !== 'string' ||
        typeof payload['role'] !== 'string' ||
        !USER_ROLES.includes(payload['role'] as UserRole)
      ) {
        throw new AuthenticationError();
      }
      return { userId: payload.sub, role: payload['role'] as UserRole };
    } catch {
      throw new AuthenticationError();
    }
  }
}
