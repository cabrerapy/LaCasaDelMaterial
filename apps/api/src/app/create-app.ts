import cors from '@fastify/cors';
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

export interface AppDependencies {
  readonly users: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly authentication: AuthenticationProvider;
  readonly categories: CategoryRepository;
  readonly products: ProductRepository;
  readonly suppliers: SupplierRepository;
  readonly purchases: PurchaseRepository;
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
  await app.register(purchasesRoutes, {
    prefix: '/api/purchases',
    authService,
    purchasesService: new PurchasesService(
      dependencies.purchases, dependencies.suppliers, dependencies.products
    )
  });

  return app;
}
