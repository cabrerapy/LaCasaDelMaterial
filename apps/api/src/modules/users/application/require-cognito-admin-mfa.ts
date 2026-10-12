import { UserApplicationError } from './user-application-error.js';

interface AdminIdentityInspector {
  inspect(userId: string): Promise<{ sub: string; confirmed: boolean; totpEnabled: boolean; enabled: boolean }>;
}

// Checks current account configuration, not MFA freshness of an already-issued JWT.
export class RequireCognitoAdminMfa {
  constructor(private readonly identities: AdminIdentityInspector,
    private readonly links: { findUserId(sub: string): Promise<string | null> }) {}

  async execute(userId: string): Promise<void> {
    const identity = await this.identities.inspect(userId);
    if (!identity.confirmed || !identity.enabled || !identity.totpEnabled ||
      await this.links.findUserId(identity.sub) !== userId) {
      throw new UserApplicationError('La administración Cognito requiere identidad vinculada y TOTP habilitado.', 403);
    }
  }
}
