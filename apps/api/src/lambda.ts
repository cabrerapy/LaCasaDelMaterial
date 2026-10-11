import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createApp } from './app/create-app.js';
import { createDynamoDbRepositories } from './app/dynamodb-repositories.js';
import { createLambdaHandler } from './app/lambda-handler.js';
import { loadProductionConfig } from './config/production-environment.js';
import { createCognitoAuthentication } from './modules/auth/infrastructure/cognito-authentication.js';
import { createCognitoUserResolver } from './modules/auth/infrastructure/resolve-cognito-user.js';
import { DynamoDbCognitoLinkRepository } from './modules/users/infrastructure/dynamodb-cognito-link.repository.js';
import { createS3DeliveryEvidenceStorage } from './modules/deliveries/infrastructure/s3-delivery-evidence.storage.js';
import type { PasswordHasher } from './modules/auth/application/password-hasher.js';

const disabledPasswords: PasswordHasher = {
  async hash() { throw new Error('Local passwords are disabled in production'); },
  async verify() { throw new Error('Local passwords are disabled in production'); }
};

// Lazy initialization, SDK execution-role credentials; no listen, provisioning or bootstrap.
export const handler = createLambdaHandler(async () => {
  const config = loadProductionConfig();
  const bucket = process.env['DELIVERY_EVIDENCE_BUCKET']?.trim() ?? '';
  const owner = process.env['AWS_ACCOUNT_ID']?.trim() ?? '';
  // Validate S3 before constructing application services; no network operation here.
  const storage = createS3DeliveryEvidenceStorage(config.awsRegion, bucket, owner);
  const dynamoDb = new DynamoDBClient({ region: config.awsRegion, maxAttempts: 3, ignoreConfiguredEndpointUrls: true });
  const documentClient = DynamoDBDocumentClient.from(dynamoDb);
  const repositories = createDynamoDbRepositories(config, documentClient);
  const links = new DynamoDbCognitoLinkRepository(documentClient, config.usersTableName);
  const authentication = createCognitoAuthentication(config.cognitoPoolId, config.cognitoClientId,
    createCognitoUserResolver(links, repositories.users));
  return createApp(config, { ...repositories, authentication, passwordHasher: disabledPasswords, deliveryEvidenceStorage: storage });
});
