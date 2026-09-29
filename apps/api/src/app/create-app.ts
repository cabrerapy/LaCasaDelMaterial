import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/environment.js';
import { healthRoutes } from '../modules/health/health.routes.js';
import { registerErrorHandler } from '../shared/error-handler.js';

export async function createApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== 'test'
  });

  await app.register(cors, { origin: false });
  registerErrorHandler(app);
  await app.register(healthRoutes, {
    prefix: '/api',
    environment: config.nodeEnv
  });

  return app;
}
