import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { AuthenticatedUser, AuthenticationProvider } from '../domain/authenticated-user.js';
import { AuthenticationError } from '../domain/authentication-error.js';
import type { User } from '../../users/domain/user.js';

export interface CognitoLinkedUser extends Pick<User, 'id' | 'role' | 'status'> {
  readonly cognitoSub: string;
}
export interface CognitoAccessTokenVerifier {
  verify(token: string): Promise<{ readonly sub: string }>;
}
export type ResolveCognitoUser = (sub: string) => Promise<CognitoLinkedUser | null>;

export function createCognitoAuthentication(userPoolId: string, clientId: string, resolveUser: ResolveCognitoUser) {
  if (!userPoolId.trim() || !clientId.trim()) throw new Error('Cognito pool and client are required');
  return new CognitoAuthentication(CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' }), resolveUser);
}

export class CognitoAuthentication implements AuthenticationProvider {
  readonly supportsPasswordLogin = false;
  constructor(private readonly verifier: CognitoAccessTokenVerifier, private readonly resolveUser: ResolveCognitoUser) {}

  createToken(_user: AuthenticatedUser): string {
    // Tokens are issued by Cognito, never by the application.
    throw new AuthenticationError();
  }

  async authenticate(authorizationHeader: string | undefined): Promise<AuthenticatedUser> {
    const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader ?? '');
    if (!match?.[1]) throw new AuthenticationError();
    let sub: string;
    try {
      sub = (await this.verifier.verify(match[1])).sub;
      if (!sub) throw new AuthenticationError();
    } catch {
      // Do not leak JWT claims, signatures or verification internals.
      throw new AuthenticationError();
    }
    // Lookup errors remain server errors rather than incorrect-credentials errors.
    const user = await this.resolveUser(sub);
    if (!user || user.status !== 'ACTIVE' || user.cognitoSub !== sub) throw new AuthenticationError();
    // Role comes only from the application record, never token groups or email.
    return { userId: user.id, role: user.role };
  }
}
