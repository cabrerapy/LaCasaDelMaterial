import { createApp } from './app/create-app.js';
import { ensureInventoryTable } from './infrastructure/dynamodb/inventory-table.js';
import { DynamoDbInventoryRepository } from './modules/inventory/infrastructure/dynamodb-inventory.repository.js';
import { loadConfig } from './config/environment.js';
import { createDynamoDbClient } from './infrastructure/dynamodb/client.js';
import { ensureUsersTable } from './infrastructure/dynamodb/users-table.js';
import { bootstrapAdmin } from './modules/auth/application/bootstrap-admin.js';
import { Argon2PasswordHasher } from './modules/auth/infrastructure/argon2-password-hasher.js';
import { LocalJwtAuthentication } from './modules/auth/infrastructure/local-jwt-authentication.js';
import { DynamoDbUserRepository } from './modules/users/infrastructure/dynamodb-user.repository.js';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ensureCategoriesTable } from './infrastructure/dynamodb/categories-table.js';
import { DynamoDbCategoryRepository } from './modules/categories/infrastructure/dynamodb-category.repository.js';
import { ensureProductsTable } from './infrastructure/dynamodb/products-table.js';
import { DynamoDbProductRepository } from './modules/products/infrastructure/dynamodb-product.repository.js';
import { ensureSuppliersTable } from './infrastructure/dynamodb/suppliers-table.js';
import { DynamoDbSupplierRepository } from './modules/suppliers/infrastructure/dynamodb-supplier.repository.js';
import { ensurePurchasesTable } from './infrastructure/dynamodb/purchases-table.js';
import { DynamoDbPurchaseRepository } from './modules/purchases/infrastructure/dynamodb-purchase.repository.js';
import { DynamoDbReceivingRepository } from './modules/receiving/infrastructure/dynamodb-receiving.repository.js';

async function start(): Promise<void> {
  const config = loadConfig();
  const dynamoDb = createDynamoDbClient(config);
  const documentClient = DynamoDBDocumentClient.from(dynamoDb);
  const users = new DynamoDbUserRepository(
    documentClient,
    config.usersTableName
  );
  const passwordHasher = new Argon2PasswordHasher();
  const authentication = new LocalJwtAuthentication(config.jwtSecret, config.jwtExpiresIn);
  const categories = new DynamoDbCategoryRepository(documentClient, config.categoriesTableName);
  const products = new DynamoDbProductRepository(documentClient, config.productsTableName);
  const suppliers = new DynamoDbSupplierRepository(documentClient, config.suppliersTableName);
  const purchases = new DynamoDbPurchaseRepository(documentClient, config.purchasesTableName);
  const inventory = new DynamoDbInventoryRepository(documentClient, config.inventoryTableName);
  const receiving = new DynamoDbReceivingRepository(documentClient, config.purchasesTableName, inventory);
  const app = await createApp(config, {
    users, passwordHasher, authentication, categories, products, suppliers, purchases, receiving, inventory
  });

  await ensureUsersTable(dynamoDb, config.usersTableName);
  await ensureCategoriesTable(dynamoDb, config.categoriesTableName);
  await ensureProductsTable(dynamoDb, config.productsTableName);
  await ensureSuppliersTable(dynamoDb, config.suppliersTableName);
  await ensurePurchasesTable(dynamoDb, config.purchasesTableName);
  await ensureInventoryTable(dynamoDb, config.inventoryTableName);
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
