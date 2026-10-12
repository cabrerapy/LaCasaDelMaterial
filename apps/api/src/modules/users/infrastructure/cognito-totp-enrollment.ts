import { AssociateSoftwareTokenCommand, GetUserCommand, VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand, CodeMismatchException, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { PendingAdminTotp, type TotpEnrollmentGateway } from '../application/pending-admin-totp.js';
import type { UserRepository } from '../domain/user.repository.js';

export class CognitoTotpEnrollment implements TotpEnrollmentGateway {
  constructor(private readonly client: CognitoIdentityProviderClient) {}
  async enabled(token: string): Promise<boolean> {
    const user = await this.client.send(new GetUserCommand({ AccessToken: token }));
    return user.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA') === true;
  }
  async associate(token: string): Promise<string> {
    const response = await this.client.send(new AssociateSoftwareTokenCommand({ AccessToken: token }));
    if (!response.SecretCode) throw new Error('Missing enrollment response');
    return response.SecretCode;
  }
  async verifyCode(token: string, code: string): Promise<boolean> {
    try {
      const response = await this.client.send(new VerifySoftwareTokenCommand({ AccessToken: token, UserCode: code }));
      return response.Status === 'SUCCESS';
    } catch (error: unknown) {
      if (error instanceof CodeMismatchException) return false;
      throw error;
    }
  }
  async prefer(token: string): Promise<void> {
    await this.client.send(new SetUserMFAPreferenceCommand({ AccessToken: token,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true } }));
  }
}

// Opt-in factory: clientId is the dedicated enrollment client, never the commercial client.
export function createPendingAdminTotp(region: string, poolId: string, clientId: string,
  users: UserRepository, links: { findUserId(sub: string): Promise<string | null> }): PendingAdminTotp {
  if (!poolId.startsWith(region + '_') || !clientId.trim()) throw new Error('Invalid enrollment configuration');
  return new PendingAdminTotp(CognitoJwtVerifier.create({ userPoolId: poolId, clientId, tokenUse: 'access' }),
    users, links, new CognitoTotpEnrollment(new CognitoIdentityProviderClient({
      region, maxAttempts: 1, ignoreConfiguredEndpointUrls: true
    })));
}
