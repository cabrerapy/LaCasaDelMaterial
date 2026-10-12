import { STSClient, GetCallerIdentityCommand, type GetCallerIdentityCommandOutput } from '@aws-sdk/client-sts';

interface IdentityClient {
  send(command: GetCallerIdentityCommand): Promise<GetCallerIdentityCommandOutput>;
}

// Read-only adapter for the bootstrap preflight contract. No credential values are returned.
export class AwsBootstrapIdentity {
  constructor(private readonly expectedAccount: string, private readonly client: IdentityClient) {
    if (!/^\d{12}$/.test(expectedAccount)) throw new Error('Invalid bootstrap account');
  }
  async read(): Promise<{ account: string; arn: string }> {
    const result = await this.client.send(new GetCallerIdentityCommand({}));
    if (result.Account !== this.expectedAccount || typeof result.Arn !== 'string' ||
      !new RegExp(`^arn:aws:iam::${this.expectedAccount}:user/[A-Za-z0-9+=,.@_/-]+$`).test(result.Arn)) {
      throw new Error('Bootstrap requires a non-root IAM user in the target account');
    }
    return { account: result.Account, arn: result.Arn };
  }
}

// Construction only; not invoked by a deploy/bootstrap executable while gates remain blocked.
export function createAwsBootstrapIdentity(account: string, region: string): AwsBootstrapIdentity {
  if (region !== 'us-east-1') throw new Error('Bootstrap region mismatch');
  return new AwsBootstrapIdentity(account, new STSClient({ region, maxAttempts: 1, ignoreConfiguredEndpointUrls: true }));
}
