import type {
  AuthenticatedUserResponse,
  LoginResponse
} from '@lcm/contracts';
import type { User } from '../../users/domain/user.js';
import type { UserRepository } from '../../users/domain/user.repository.js';
import type { PasswordHasher } from './password-hasher.js';
import type { AuthenticatedUser, AuthenticationProvider } from '../domain/authenticated-user.js';
import { AuthenticationError } from '../domain/authentication-error.js';

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly authentication: AuthenticationProvider
  ) {}

  async login(username: string, password: string): Promise<LoginResponse> {
    const user = await this.users.findByUsername(username.trim().toLowerCase());
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await this.passwordHasher.verify(user.passwordHash, password))
    ) {
      throw new AuthenticationError();
    }

    return {
      accessToken: this.authentication.createToken({ userId: user.id, role: user.role }),
      user: toAuthenticatedUserResponse(user)
    };
  }

  async getAuthenticatedUser(authorizationHeader: string | undefined): Promise<AuthenticatedUserResponse> {
    const user = await this.resolveActiveUser(authorizationHeader);
    return toAuthenticatedUserResponse(user);
  }

  async authenticate(authorizationHeader: string | undefined): Promise<AuthenticatedUser> {
    const user = await this.resolveActiveUser(authorizationHeader);
    return { userId: user.id, role: user.role };
  }

  private async resolveActiveUser(authorizationHeader: string | undefined): Promise<User> {
    const identity = this.authentication.authenticate(authorizationHeader);
    const user = await this.users.findById(identity.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AuthenticationError();
    }
    return user;
  }
}

function toAuthenticatedUserResponse(user: User): AuthenticatedUserResponse {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role
  };
}
