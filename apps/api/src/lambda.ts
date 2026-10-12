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
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoUserProvisioningAdapter } from './modules/users/infrastructure/cognito-user-provisioning.js';
import { StageCognitoUser } from './modules/users/application/stage-cognito-user.js';
import { InviteCognitoUser } from './modules/users/application/invite-cognito-user.js';
import { ActivateCognitoUser } from './modules/users/application/activate-cognito-user.js';
import { RequireCognitoAdminMfa } from './modules/users/application/require-cognito-admin-mfa.js';
import { DeactivateCognitoUser } from './modules/users/application/deactivate-cognito-user.js';
import { createPendingAdminTotp } from './modules/users/infrastructure/cognito-totp-enrollment.js';
import { enrollmentClientId } from './config/enrollment-client.js';

const disabledPasswords: PasswordHasher = {
  async hash() { throw new Error('Local passwords are disabled in production'); },
  async verify() { throw new Error('Local passwords are disabled in production'); }
};

// Lazy initialization, SDK execution-role credentials; no listen, provisioning or bootstrap.
export const handler = createLambdaHandler(async () => {
  const config = loadProductionConfig();
  const enrollmentClient = enrollmentClientId(process.env, config.cognitoClientId);
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
  const adminFlag = process.env['LCM_COGNITO_ADMIN_ENABLED'];
  if (adminFlag !== undefined && adminFlag !== 'yes' && adminFlag !== 'no') throw new Error('Invalid Cognito admin flag');
  // Disabled until invitation rate limits, MFA and bootstrap are accepted for beta.
  const cognitoClient = adminFlag === 'yes' ? new CognitoIdentityProviderClient({ region: config.awsRegion,
    maxAttempts: 1, ignoreConfiguredEndpointUrls: true }) : undefined;
  const identities = cognitoClient ? new CognitoUserProvisioningAdapter(cognitoClient, config.cognitoPoolId) : undefined;
  const cognitoUserLifecycle = identities ? {
    requireAdministratorMfa: (userId: string) => new RequireCognitoAdminMfa(identities, links).execute(userId),
    stage: new StageCognitoUser(repositories.users, identities, links),
    invite: new InviteCognitoUser(repositories.users, identities, links),
    activate: new ActivateCognitoUser(repositories.users, identities, links),
    deactivate: new DeactivateCognitoUser(repositories.users, identities, links)
  } : undefined;
  return createApp(config, { ...repositories, authentication, passwordHasher: disabledPasswords,
    ...(enrollmentClient ? { pendingAdminTotp: createPendingAdminTotp(config.awsRegion,
      config.cognitoPoolId, enrollmentClient, repositories.users, links) } : {}),
    deliveryEvidenceStorage: storage, ...(cognitoUserLifecycle ? { cognitoUserLifecycle } : {}) });
});
