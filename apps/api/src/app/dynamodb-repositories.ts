import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AppConfig } from '../config/environment.js';
import type { AppDependencies } from './create-app.js';
import { DynamoDbInventoryRepository } from '../modules/inventory/infrastructure/dynamodb-inventory.repository.js';
import { DynamoDbUserRepository } from '../modules/users/infrastructure/dynamodb-user.repository.js';
import { DynamoDbCategoryRepository } from '../modules/categories/infrastructure/dynamodb-category.repository.js';
import { DynamoDbProductRepository } from '../modules/products/infrastructure/dynamodb-product.repository.js';
import { DynamoDbSupplierRepository } from '../modules/suppliers/infrastructure/dynamodb-supplier.repository.js';
import { DynamoDbPurchaseRepository } from '../modules/purchases/infrastructure/dynamodb-purchase.repository.js';
import { DynamoDbReceivingRepository } from '../modules/receiving/infrastructure/dynamodb-receiving.repository.js';
import { DynamoDbCustomerRepository } from '../modules/customers/infrastructure/dynamodb-customer.repository.js';
import { DynamoDbSaleRepository } from '../modules/sales/infrastructure/dynamodb-sale.repository.js';
import { DynamoDbCostingRepository } from '../modules/costing/infrastructure/dynamodb-costing.repository.js';
import { DynamoDbCashRepository } from '../modules/cash/infrastructure/dynamodb-cash.repository.js';
import { DynamoDbTruckRepository } from '../modules/trucks/infrastructure/dynamodb-truck.repository.js';
import { DynamoDbDriverRepository } from '../modules/drivers/infrastructure/dynamodb-driver.repository.js';
import { DynamoDbTripRepository } from '../modules/trips/infrastructure/dynamodb-trip.repository.js';
import { DynamoDbTripLoadRepository } from '../modules/trip-loads/infrastructure/dynamodb-trip-load.repository.js';
import { DynamoDbFuelRepository } from '../modules/fuel/infrastructure/dynamodb-fuel.repository.js';
import { DynamoDbDeliveryRepository } from '../modules/deliveries/infrastructure/dynamodb-delivery.repository.js';

export type DynamoDbRepositories = Omit<AppDependencies, 'passwordHasher' | 'authentication' | 'deliveryEvidenceStorage'>;

// Composition only: provisioning and admin bootstrap belong to explicit startup workflows.
export function createDynamoDbRepositories(config: AppConfig, documentClient: DynamoDBDocumentClient): DynamoDbRepositories {
  const users = new DynamoDbUserRepository(
    documentClient,
    config.usersTableName
  );
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
  const tripLoads = new DynamoDbTripLoadRepository(documentClient, config.tripLoadsTableName,config.deliveriesTableName);
  const fuel = new DynamoDbFuelRepository(documentClient, config.fuelTableName);
  const deliveries = new DynamoDbDeliveryRepository(documentClient, config.deliveriesTableName, config.tripsTableName, config.trucksTableName, config.tripLoadsTableName);
  return { users, categories, products, suppliers, purchases, receiving, inventory, customers, sales, costing, cash, trucks, drivers, trips, tripLoads, fuel, deliveries };
}

