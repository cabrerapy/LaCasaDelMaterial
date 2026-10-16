import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { reviewBootstrap } from '../apps/api/dist/modules/users/application/review-bootstrap.js';
import { CognitoBootstrapResourceReader } from '../apps/api/dist/modules/users/infrastructure/cognito-bootstrap-resource-reader.js';
import { DynamoDbUserRepository } from '../apps/api/dist/modules/users/infrastructure/dynamodb-user.repository.js';
import { DynamoDbBootstrapReservation } from '../apps/api/dist/modules/users/infrastructure/dynamodb-bootstrap-reservation.js';
import { reviewBootstrapResume } from '../apps/api/dist/modules/users/application/review-bootstrap-resume.js';

// Opt-in read-only command. Reservation adapter is used ONLY for inspectPending.
try {
  const [file, operation, extra] = process.argv.slice(2);
  if (!file || extra || process.env.LCM_BOOTSTRAP_REVIEW !== 'yes') throw new Error('Review not authorized');
  const target = JSON.parse(await readFile(file, 'utf8'));
  const keys = ['accountId', 'region', 'poolId', 'usersTable'];
  if (!target || typeof target !== 'object' || Array.isArray(target) ||
    Object.keys(target).length !== keys.length || keys.some(key => typeof target[key] !== 'string')) {
    throw new Error('Invalid public target');
  }
  const require = createRequire(new URL('../infrastructure/aws/package.json', import.meta.url));
  const { createAwsBootstrapIdentity } = require('./dist/lib/aws-bootstrap-identity.js');
  const identity = createAwsBootstrapIdentity(target.accountId, target.region);
  const config = { region: target.region, maxAttempts: 1, ignoreConfiguredEndpointUrls: true };
  const dynamo = new DynamoDBClient(config);
  const cognito = new CognitoIdentityProviderClient(config);
  try {
    const document = DynamoDBDocumentClient.from(dynamo);
    const resources = new CognitoBootstrapResourceReader(dynamo, cognito);
    const users = new DynamoDbUserRepository(document, target.usersTable, true);
    const result = operation ? await reviewBootstrapResume(target, operation, () => identity.read(), resources, users,
      new DynamoDbBootstrapReservation(document, target.usersTable, target.accountId)) :
      await reviewBootstrap(target, () => identity.read(), resources, users);
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally { dynamo.destroy(); cognito.destroy(); }
} catch {
  console.error('Bootstrap review failed. Check explicit review opt-in, public target, credentials and permissions. No bootstrap writes performed.');
  process.exitCode = 1;
}
