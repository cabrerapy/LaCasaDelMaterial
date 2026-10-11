import { S3Client, PutObjectCommand, type PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { STSClient, GetCallerIdentityCommand, type GetCallerIdentityCommandOutput } from '@aws-sdk/client-sts';
import type { PublicConfigObject, RuntimeConfigPublisher } from './runtime-config-publication.js';

interface IdentityClient {
  send(command: GetCallerIdentityCommand): Promise<GetCallerIdentityCommandOutput>;
}
interface ObjectClient {
  send(command: PutObjectCommand): Promise<PutObjectCommandOutput>;
}

export class AwsRuntimeConfigPublisher implements RuntimeConfigPublisher {
  constructor(private readonly region: string, private readonly identity: IdentityClient,
    private readonly objects: ObjectClient) {}

  async verifyAccount(): Promise<string> {
    const response = await this.identity.send(new GetCallerIdentityCommand({}));
    if (!response.Account || !/^[0-9]{12}$/.test(response.Account)) throw new Error('Invalid AWS identity response');
    return response.Account;
  }

  async putObject(region: string, object: PublicConfigObject): Promise<void> {
    if (region !== this.region) throw new Error('Publisher region mismatch');
    await this.objects.send(new PutObjectCommand(object));
  }
}

// Construction performs no AWS calls. Uses the SDK credential chain, never hardcoded keys.
// No executable deployment path calls this factory while readiness gates are blocked.
export function createAwsRuntimeConfigPublisher(region: string): RuntimeConfigPublisher {
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) throw new Error('Invalid AWS region');
  const config = { region, maxAttempts: 3, ignoreConfiguredEndpointUrls: true };
  return new AwsRuntimeConfigPublisher(region, new STSClient(config), new S3Client(config));
}
