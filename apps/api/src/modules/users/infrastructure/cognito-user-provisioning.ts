import { AdminCreateUserCommand, AdminDisableUserCommand, AdminEnableUserCommand, AdminGetUserCommand, type CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { CognitoUserProvisioning } from '../application/stage-cognito-user.js';

export class CognitoUserProvisioningAdapter implements CognitoUserProvisioning {
  constructor(private readonly client: CognitoIdentityProviderClient, private readonly poolId: string) {
    if (!poolId.trim()) throw new Error('Cognito pool is required');
  }

  async createSuppressed(username: string, email: string, name: string): Promise<string> {
    const response = await this.client.send(new AdminCreateUserCommand({
      UserPoolId: this.poolId, Username: username, MessageAction: 'SUPPRESS',
      DesiredDeliveryMediums: ['EMAIL'], ForceAliasCreation: false,
      UserAttributes: [{ Name: 'email', Value: email }, { Name: 'name', Value: name }]
    }));
    const sub = response.User?.Attributes?.find(attribute => attribute.Name === 'sub')?.Value;
    if (!sub || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) {
      throw new Error('Cognito did not return a valid subject');
    }
    return sub;
  }

  async disable(username: string): Promise<void> {
    try {
      await this.client.send(new AdminDisableUserCommand({ UserPoolId: this.poolId, Username: username }));
    } catch (error: unknown) {
      if (!(error instanceof Error && error.name === 'UserNotFoundException')) throw error;
    }
  }

  async inspect(username: string): Promise<{ sub: string; confirmed: boolean; email: string; passwordChangeRequired: boolean; totpEnabled: boolean; enabled: boolean }> {
    const user = await this.client.send(new AdminGetUserCommand({ UserPoolId: this.poolId, Username: username }));
    const sub = user.UserAttributes?.find(attribute => attribute.Name === 'sub')?.Value;
    if (!sub || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) {
      throw new Error('Cognito did not return a valid subject');
    }
    return { sub, confirmed: user.UserStatus === 'CONFIRMED',
      email: user.UserAttributes?.find(attribute => attribute.Name === 'email')?.Value ?? '',
      passwordChangeRequired: user.UserStatus === 'FORCE_CHANGE_PASSWORD',
      enabled: user.Enabled === true,
      totpEnabled: user.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA') === true };
  }

  async enable(username: string): Promise<void> {
    await this.client.send(new AdminEnableUserCommand({ UserPoolId: this.poolId, Username: username }));
  }

  async resendInvitation(username: string): Promise<void> {
    await this.client.send(new AdminCreateUserCommand({ UserPoolId: this.poolId, Username: username,
      MessageAction: 'RESEND', DesiredDeliveryMediums: ['EMAIL'], ForceAliasCreation: false }));
  }
}
