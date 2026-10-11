import { AdminCreateUserCommand, AdminDisableUserCommand, type CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
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
    if (!sub) throw new Error('Cognito did not return a subject');
    return sub;
  }

  async disable(username: string): Promise<void> {
    try {
      await this.client.send(new AdminDisableUserCommand({ UserPoolId: this.poolId, Username: username }));
    } catch (error: unknown) {
      if (!(error instanceof Error && error.name === 'UserNotFoundException')) throw error;
    }
  }
}
