import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { AppConfig } from '../../config/environment.js';

export function createDynamoDbClient(config: AppConfig): DynamoDBClient {
  return new DynamoDBClient({
    region: config.awsRegion,
    ...(config.dynamoDbEndpoint ? { endpoint: config.dynamoDbEndpoint } : {})
  });
}
