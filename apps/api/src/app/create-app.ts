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

export interface AppDependencies {
  readonly users: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly authentication: AuthenticationProvider;
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

  return app;
}
