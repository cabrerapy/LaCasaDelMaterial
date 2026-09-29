import { createApp } from './app/create-app.js';
import { loadConfig } from './config/environment.js';
import { createDynamoDbClient } from './infrastructure/dynamodb/client.js';
import { ensureUsersTable } from './infrastructure/dynamodb/users-table.js';
import { bootstrapAdmin } from './modules/auth/application/bootstrap-admin.js';
import { Argon2PasswordHasher } from './modules/auth/infrastructure/argon2-password-hasher.js';
import { LocalJwtAuthentication } from './modules/auth/infrastructure/local-jwt-authentication.js';
import { DynamoDbUserRepository } from './modules/users/infrastructure/dynamodb-user.repository.js';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

async function start(): Promise<void> {
  const config = loadConfig();
  const dynamoDb = createDynamoDbClient(config);
  const users = new DynamoDbUserRepository(
    DynamoDBDocumentClient.from(dynamoDb),
    config.usersTableName
  );
  const passwordHasher = new Argon2PasswordHasher();
  const authentication = new LocalJwtAuthentication(config.jwtSecret, config.jwtExpiresIn);
  const app = await createApp(config, { users, passwordHasher, authentication });

  await ensureUsersTable(dynamoDb, config.usersTableName);
  await bootstrapAdmin(users, passwordHasher, config.initialAdminPassword, app.log);

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error: unknown) {
    app.log.error(error);
    process.exit(1);
  }
}

void start().catch(() => {
  console.error('API failed to start');
  process.exitCode = 1;
});
