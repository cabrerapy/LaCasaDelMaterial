import { runtimeConfigFromOutputs } from './web-runtime-config.js';

export interface RuntimeConfigPublication {
  readonly bucket: string;
  readonly expectedBucketOwner: string;
  readonly region: string;
  readonly frontendOrigin: string;
  readonly stackName: string;
  readonly outputKey: string;
}
export interface PublicConfigObject {
  readonly Bucket: string;
  readonly ExpectedBucketOwner: string;
  readonly Key: 'runtime-config.json';
  readonly Body: string;
  readonly ContentType: 'application/json; charset=utf-8';
  readonly CacheControl: 'no-store, max-age=0';
}
export interface RuntimeConfigPublisher {
  verifyAccount(): Promise<string>;
  putObject(region: string, object: PublicConfigObject): Promise<void>;
}

// Offline-capable boundary. AWS adapter/pipeline stays blocked until deployment approval.
export function prepareRuntimeConfigPublication(outputs: unknown, target: RuntimeConfigPublication): PublicConfigObject {
  if (!/^[0-9]{12}$/.test(target.expectedBucketOwner) ||
    !/^[a-z]{2}-[a-z]+-\d$/.test(target.region) ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(target.bucket) ||
    target.bucket.includes('..') || /^[0-9]+(?:\.[0-9]+){3}$/.test(target.bucket)) {
    throw new Error('Invalid publication target');
  }
  const origin = new URL(target.frontendOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== target.frontendOrigin) throw new Error('Invalid frontend origin');
  const body = runtimeConfigFromOutputs(outputs, target.stackName, target.outputKey);
  const config: { cognito: { redirectUri: string; logoutUri: string } } = JSON.parse(body);
  if (new URL(config.cognito.redirectUri).origin !== origin.origin ||
    new URL(config.cognito.logoutUri).origin !== origin.origin) throw new Error('Frontend output mismatch');
  return { Bucket: target.bucket, ExpectedBucketOwner: target.expectedBucketOwner,
    Key: 'runtime-config.json', Body: body, ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store, max-age=0' };
}

export async function publishRuntimeConfig(outputs: unknown, target: RuntimeConfigPublication,
  publisher: RuntimeConfigPublisher): Promise<void> {
  const object = prepareRuntimeConfigPublication(outputs, target);
  if (await publisher.verifyAccount() !== target.expectedBucketOwner) throw new Error('AWS account mismatch');
  await publisher.putObject(target.region, object);
}
