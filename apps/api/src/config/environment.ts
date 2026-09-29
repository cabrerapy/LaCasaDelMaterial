import 'dotenv/config';

export interface AppConfig {
  readonly nodeEnv: string;
  readonly host: string;
  readonly port: number;
  readonly awsRegion: string;
  readonly dynamoDbEndpoint?: string;
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }
  return port;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const endpoint = environment['DYNAMODB_ENDPOINT']?.trim();

  return {
    nodeEnv: environment['NODE_ENV']?.trim() || 'development',
    host: environment['API_HOST']?.trim() || '0.0.0.0',
    port: readPort(environment['API_PORT']),
    awsRegion: environment['AWS_REGION']?.trim() || 'us-east-1',
    ...(endpoint ? { dynamoDbEndpoint: endpoint } : {})
  };
}
