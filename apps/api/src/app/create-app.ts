import cors from '@fastify/cors';
import type { InventoryRepository } from '../modules/inventory/domain/inventory.js';
import { InventoryService } from '../modules/inventory/application/inventory.service.js';
import { inventoryRoutes } from '../modules/inventory/http/inventory.routes.js';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/environment.js';
import { healthRoutes } from '../modules/health/health.routes.js';
import { AuthService } from '../modules/auth/application/auth.service.js';
import { authRoutes } from '../modules/auth/http/auth.routes.js';
import type { PasswordHasher } from '../modules/auth/application/password-hasher.js';
import type { AuthenticationProvider } from '../modules/auth/domain/authenticated-user.js';
import type { UserRepository } from '../modules/users/domain/user.repository.js';
import { UsersService } from '../modules/users/application/users.service.js';
import { usersRoutes } from '../modules/users/http/users.routes.js';
import { registerErrorHandler } from '../shared/error-handler.js';
import type { CategoryRepository } from '../modules/categories/domain/category.repository.js';
import { CategoriesService } from '../modules/categories/application/categories.service.js';
import { categoriesRoutes } from '../modules/categories/http/categories.routes.js';
import type { ProductRepository } from '../modules/products/domain/product.repository.js';
import { ProductsService } from '../modules/products/application/products.service.js';
import { productsRoutes } from '../modules/products/http/products.routes.js';
import type { SupplierRepository } from '../modules/suppliers/domain/supplier.repository.js';
import { SuppliersService } from '../modules/suppliers/application/suppliers.service.js';
import { suppliersRoutes } from '../modules/suppliers/http/suppliers.routes.js';
import type { PurchaseRepository } from '../modules/purchases/domain/purchase.repository.js';
import { PurchasesService } from '../modules/purchases/application/purchases.service.js';
import { purchasesRoutes } from '../modules/purchases/http/purchases.routes.js';
import type { ReceivingRepository } from '../modules/receiving/domain/receiving.repository.js';
import { ReceivingService } from '../modules/receiving/application/receiving.service.js';
import { receivingRoutes } from '../modules/receiving/http/receiving.routes.js';
import { lotsRoutes } from '../modules/receiving/http/lots.routes.js';
import { purchaseReceivingRoutes } from '../modules/receiving/http/purchase-receiving.routes.js';
import type { CustomerRepository } from '../modules/customers/domain/customer.repository.js';
import { CustomersService } from '../modules/customers/application/customers.service.js';
import { customersRoutes } from '../modules/customers/http/customers.routes.js';
import type { SaleRepository } from '../modules/sales/domain/sale.repository.js';
import { SalesService } from '../modules/sales/application/sales.service.js';
import { salesRoutes } from '../modules/sales/http/sales.routes.js';
import type { CostingRepository } from '../modules/costing/domain/costing.repository.js';
import { FifoCostingService } from '../modules/costing/application/fifo-costing.service.js';
import type { CashRepository } from '../modules/cash/domain/cash.repository.js';
import { CashService } from '../modules/cash/application/cash.service.js';
import { cashRoutes } from '../modules/cash/http/cash.routes.js';

export interface AppDependencies {
  readonly users: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly authentication: AuthenticationProvider;
  readonly categories: CategoryRepository;
  readonly products: ProductRepository;
  readonly suppliers: SupplierRepository;
  readonly purchases: PurchaseRepository;
  readonly receiving: ReceivingRepository;
  readonly inventory: InventoryRepository;
  readonly customers: CustomerRepository;
  readonly sales: SaleRepository;
  readonly costing: CostingRepository;
  readonly cash: CashRepository;
}

export async function createApp(
  config: AppConfig,
  dependencies: AppDependencies
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== 'test'
  });

  await app.register(cors, { origin: config.webOrigin });
  registerErrorHandler(app);
  await app.register(healthRoutes, {
    prefix: '/api',
    environment: config.nodeEnv
  });
  const authService = new AuthService(
    dependencies.users,
    dependencies.passwordHasher,
    dependencies.authentication
  );
  await app.register(authRoutes, {
    prefix: '/api/auth',
    authService
  });
  await app.register(usersRoutes, {
    prefix: '/api/users',
    authService,
    usersService: new UsersService(dependencies.users, dependencies.passwordHasher)
  });
  await app.register(categoriesRoutes, {
    prefix: '/api/categories',
    authService,
    categoriesService: new CategoriesService(dependencies.categories)
  });
  await app.register(productsRoutes, {
    prefix: '/api/products',
    authService,
    productsService: new ProductsService(dependencies.products, dependencies.categories)
  });
  await app.register(suppliersRoutes, {
    prefix: '/api/suppliers',
    authService,
    suppliersService: new SuppliersService(dependencies.suppliers)
  });
  await app.register(customersRoutes, { prefix: '/api/customers', authService,
    service: new CustomersService(dependencies.customers) });
  await app.register(purchasesRoutes, {
    prefix: '/api/purchases',
    authService,
    purchasesService: new PurchasesService(
      dependencies.purchases, dependencies.suppliers, dependencies.products
    )
  });
  const inventory = new InventoryService(dependencies.inventory);
  await app.register(stockRoutes, { prefix: '/api/inventory', authService,
    stock: new StockService(dependencies.products, dependencies.categories, dependencies.inventory) });
  const receivingService = new ReceivingService(dependencies.receiving, dependencies.purchases, inventory);
  await app.register(inventoryRoutes, { prefix: '/api/inventory', authService, inventory });
  await app.register(purchaseReceivingRoutes, { prefix: '/api/purchases', authService, service: receivingService });
  await app.register(receivingRoutes, { prefix: '/api/purchase-receipts', authService, service: receivingService });
  await app.register(lotsRoutes, { prefix: '/api/lots', authService, service: receivingService });
  const costing = new FifoCostingService(dependencies.costing, dependencies.receiving, dependencies.sales);
  const cash = new CashService(dependencies.cash);
  await app.register(cashRoutes, { prefix: '/api/cash', authService, service: cash });
  await app.register(salesRoutes, { prefix: '/api/sales', authService,
    service: new SalesService(dependencies.sales, dependencies.products, dependencies.customers, dependencies.inventory, costing, cash), costing });

  return app;
}
import { StockService } from '../modules/inventory/application/stock.service.js';
import { stockRoutes } from '../modules/inventory/http/stock.routes.js';
