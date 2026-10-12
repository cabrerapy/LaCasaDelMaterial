import type { UserRepository } from '../domain/user.repository.js';
import { UserApplicationError } from './user-application-error.js';
import { AuthenticationError } from '../../auth/domain/authentication-error.js';

export interface EnrollmentVerifier {
  verify(token: string): Promise<{ sub: string; scope?: string; auth_time?: number }>;
}
export interface TotpEnrollmentGateway {
  enabled(token: string): Promise<boolean>;
  associate(token: string): Promise<string>;
  verifyCode(token: string, code: string): Promise<boolean>;
  prefer(token: string): Promise<void>;
}

// Isolated onboarding only. Never issues application sessions or writes ACTIVE.
export class PendingAdminTotp {
  constructor(private readonly verifier: EnrollmentVerifier, private readonly users: UserRepository,
    private readonly links: { findUserId(sub: string): Promise<string | null> },
    private readonly gateway: TotpEnrollmentGateway, private readonly now: () => number = Date.now) {}

  async begin(authorization: string | undefined): Promise<{ secretCode: string }> {
    const token = await this.authorize(authorization);
    if (await this.gateway.enabled(token)) throw new UserApplicationError('TOTP ya está habilitado', 409);
    const secretCode = await this.gateway.associate(token);
    if (!/^[A-Z2-7]{16,128}$/.test(secretCode)) throw new Error('Invalid enrollment response');
    return { secretCode }; // Sensitive: transient display only, no persistence/logging.
  }

  async complete(authorization: string | undefined, code: string): Promise<{ status: 'MFA_CONFIGURED_NOT_ACTIVE' }> {
    if (!/^[0-9]{6}$/.test(code)) throw new UserApplicationError('Ingresá un código de seis dígitos', 400);
    const token = await this.authorize(authorization);
    if (!await this.gateway.enabled(token)) {
      if (!await this.gateway.verifyCode(token, code)) throw new UserApplicationError('Código TOTP no aceptado', 400);
    }
    await this.authorize(authorization); // Recheck even when a previous attempt enabled TOTP.
    await this.gateway.prefer(token); // Retry a partially completed preference update without replacing the secret.
    return { status: 'MFA_CONFIGURED_NOT_ACTIVE' };
  }

  private async authorize(authorization: string | undefined): Promise<string> {
    const match = /^Bearer ([^\s]{1,10000})$/.exec(authorization ?? '');
    if (!match?.[1]) throw new AuthenticationError();
    let claims: Awaited<ReturnType<EnrollmentVerifier['verify']>>;
    try { claims = await this.verifier.verify(match[1]); } catch { throw new AuthenticationError(); }
    const nowSeconds = Math.floor(this.now() / 1000);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.sub) ||
      !claims.scope?.split(/\s+/).includes('aws.cognito.signin.user.admin') ||
      !Number.isSafeInteger(claims.auth_time) || claims.auth_time! > nowSeconds ||
      nowSeconds - claims.auth_time! > 600) throw new AuthenticationError();
    const id = await this.links.findUserId(claims.sub);
    const user = id ? await this.users.findById(id) : null;
    if (!user || user.role !== 'ADMIN' || user.status !== 'INACTIVE' ||
      user.passwordHash !== '!COGNITO_ONLY' || user.cognitoDeactivatedAt) throw new AuthenticationError();
    return match[1];
  }
}
