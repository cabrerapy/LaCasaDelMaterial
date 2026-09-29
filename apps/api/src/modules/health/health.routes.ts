import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@lcm/contracts';

interface HealthRouteOptions {
  readonly environment: string;
}

export async function healthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions
): Promise<void> {
  app.get<{ Reply: HealthResponse }>('/health', async () => ({
    status: 'ok',
    service: 'la-casa-del-material-api',
    version: '0.1.0',
    environment: options.environment
  }));
}
