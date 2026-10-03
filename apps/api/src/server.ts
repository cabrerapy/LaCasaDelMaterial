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
import { ensureCustomersTable } from './infrastructure/dynamodb/customers-table.js';
import { DynamoDbCustomerRepository } from './modules/customers/infrastructure/dynamodb-customer.repository.js';
import { ensureSalesTable } from './infrastructure/dynamodb/sales-table.js';
import { DynamoDbSaleRepository } from './modules/sales/infrastructure/dynamodb-sale.repository.js';
import { ensureCostingTable } from './infrastructure/dynamodb/costing-table.js';
import { DynamoDbCostingRepository } from './modules/costing/infrastructure/dynamodb-costing.repository.js';
import { ensureCashTable } from './infrastructure/dynamodb/cash-table.js';
import { DynamoDbCashRepository } from './modules/cash/infrastructure/dynamodb-cash.repository.js';
import { ensureTrucksTable } from './infrastructure/dynamodb/trucks-table.js';
import { DynamoDbTruckRepository } from './modules/trucks/infrastructure/dynamodb-truck.repository.js';
import { ensureDriversTable } from './infrastructure/dynamodb/drivers-table.js';
import { DynamoDbDriverRepository } from './modules/drivers/infrastructure/dynamodb-driver.repository.js';
import { ensureTripsTable } from './infrastructure/dynamodb/trips-table.js';
import { DynamoDbTripRepository } from './modules/trips/infrastructure/dynamodb-trip.repository.js';
import { ensureTripLoadsTable } from './infrastructure/dynamodb/trip-loads-table.js';
import { DynamoDbTripLoadRepository } from './modules/trip-loads/infrastructure/dynamodb-trip-load.repository.js';
import { ensureFuelTable } from './infrastructure/dynamodb/fuel-table.js';
import { DynamoDbFuelRepository } from './modules/fuel/infrastructure/dynamodb-fuel.repository.js';
import { ensureDeliveriesTable } from './infrastructure/dynamodb/deliveries-table.js';
import { DynamoDbDeliveryRepository } from './modules/deliveries/infrastructure/dynamodb-delivery.repository.js';
import { LocalDeliveryEvidenceStorage } from './modules/deliveries/infrastructure/local-delivery-evidence.storage.js';

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
  const customers = new DynamoDbCustomerRepository(documentClient, config.customersTableName);
  const cash = new DynamoDbCashRepository(documentClient, config.cashTableName);
  const sales = new DynamoDbSaleRepository(documentClient, config.salesTableName, inventory, cash);
  const costing = new DynamoDbCostingRepository(documentClient, config.costingTableName);
  const trucks = new DynamoDbTruckRepository(documentClient, config.trucksTableName);
  const drivers = new DynamoDbDriverRepository(documentClient, config.driversTableName);
  const trips = new DynamoDbTripRepository(documentClient, config.tripsTableName, config.trucksTableName);
  const tripLoads = new DynamoDbTripLoadRepository(documentClient, config.tripLoadsTableName);
  const fuel = new DynamoDbFuelRepository(documentClient, config.fuelTableName);
  const deliveries = new DynamoDbDeliveryRepository(documentClient, config.deliveriesTableName, config.tripsTableName, config.trucksTableName, config.tripLoadsTableName);
  const app = await createApp(config, {
    users, passwordHasher, authentication, categories, products, suppliers, purchases, receiving, inventory, customers, sales, costing, cash, trucks, drivers, trips, tripLoads, fuel, deliveries, deliveryEvidenceStorage:new LocalDeliveryEvidenceStorage('.data/delivery-evidence')
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

void start().catch((error: unknown) => {
  console.error('API failed to start', error);
  process.exitCode = 1;
});
