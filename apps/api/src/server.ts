import { createApp } from './app/create-app.js';
import { ensureInventoryTable } from './infrastructure/dynamodb/inventory-table.js';
import { loadConfig } from './config/environment.js';
import { createDynamoDbClient } from './infrastructure/dynamodb/client.js';
import { ensureUsersTable } from './infrastructure/dynamodb/users-table.js';
import { bootstrapAdmin } from './modules/auth/application/bootstrap-admin.js';
import { Argon2PasswordHasher } from './modules/auth/infrastructure/argon2-password-hasher.js';
import { LocalJwtAuthentication } from './modules/auth/infrastructure/local-jwt-authentication.js';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ensureCategoriesTable } from './infrastructure/dynamodb/categories-table.js';
import { ensureProductsTable } from './infrastructure/dynamodb/products-table.js';
import { ensureSuppliersTable } from './infrastructure/dynamodb/suppliers-table.js';
import { ensurePurchasesTable } from './infrastructure/dynamodb/purchases-table.js';
import { ensureCustomersTable } from './infrastructure/dynamodb/customers-table.js';
import { ensureSalesTable } from './infrastructure/dynamodb/sales-table.js';
import { ensureCostingTable } from './infrastructure/dynamodb/costing-table.js';
import { ensureCashTable } from './infrastructure/dynamodb/cash-table.js';
import { ensureTrucksTable } from './infrastructure/dynamodb/trucks-table.js';
import { ensureDriversTable } from './infrastructure/dynamodb/drivers-table.js';
import { ensureTripsTable } from './infrastructure/dynamodb/trips-table.js';
import { ensureTripLoadsTable } from './infrastructure/dynamodb/trip-loads-table.js';
import { ensureFuelTable } from './infrastructure/dynamodb/fuel-table.js';
import { ensureDeliveriesTable } from './infrastructure/dynamodb/deliveries-table.js';
import { LocalDeliveryEvidenceStorage } from './modules/deliveries/infrastructure/local-delivery-evidence.storage.js';

import { createDynamoDbRepositories } from './app/dynamodb-repositories.js';

async function start(): Promise<void> {
  const config = loadConfig();
  const dynamoDb = createDynamoDbClient(config);
  const documentClient = DynamoDBDocumentClient.from(dynamoDb);
  const repositories = createDynamoDbRepositories(config, documentClient);
  const passwordHasher = new Argon2PasswordHasher();
  const authentication = new LocalJwtAuthentication(config.jwtSecret, config.jwtExpiresIn);
  const app = await createApp(config, {
    ...repositories, passwordHasher, authentication,
    deliveryEvidenceStorage: new LocalDeliveryEvidenceStorage('.data/delivery-evidence')
  });

  await ensureUsersTable(dynamoDb, config.usersTableName);
  await ensureCategoriesTable(dynamoDb, config.categoriesTableName);
  await ensureProductsTable(dynamoDb, config.productsTableName);
  await ensureSuppliersTable(dynamoDb, config.suppliersTableName);
  await ensurePurchasesTable(dynamoDb, config.purchasesTableName);
  await ensureInventoryTable(dynamoDb, config.inventoryTableName);
  await ensureCustomersTable(dynamoDb, config.customersTableName);
  await ensureSalesTable(dynamoDb, config.salesTableName);
  await ensureCostingTable(dynamoDb, config.costingTableName);
  await ensureCashTable(dynamoDb, config.cashTableName);
  await ensureTrucksTable(dynamoDb, config.trucksTableName);
  await ensureDriversTable(dynamoDb, config.driversTableName);
  await ensureTripsTable(dynamoDb, config.tripsTableName);
  await ensureTripLoadsTable(dynamoDb, config.tripLoadsTableName);
  await ensureFuelTable(dynamoDb, config.fuelTableName);
  await ensureDeliveriesTable(dynamoDb, config.deliveriesTableName);
  await bootstrapAdmin(repositories.users, passwordHasher, config.initialAdminPassword, app.log);

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

void start().catch((error: unknown) => {
  console.error('API failed to start', error);
  process.exitCode = 1;
});
