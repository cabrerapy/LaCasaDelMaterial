import { hasPermission, STOCK_STATUSES, type StockFilters } from '@lcm/contracts';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { StockService } from '../application/stock.service.js';
export async function stockRoutes(app: FastifyInstance, options: { authService: AuthService; stock: StockService }): Promise<void> {
  const guard = requirePermission(options.authService, 'inventory.read');
  const id = { type: 'string', format: 'uuid' } as const;
  app.get<{ Querystring: StockFilters }>('/stock', { preHandler: guard, schema: { querystring: {
    type: 'object', additionalProperties: false, properties: {
      search: { type: 'string', maxLength: 180 }, categoryId: id,
      productStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'ALL'], default: 'ACTIVE' },
      stockStatus: { type: 'string', enum: [...STOCK_STATUSES] }, trackStock: { type: 'boolean' },
      sort: { type: 'string', enum: ['name', 'code', 'stockStatus'], default: 'name' },
      pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 }, nextToken: { type: 'string', minLength: 1, maxLength: 2000 }
    }
  } } }, (request) => options.stock.list(request.query));
  app.get('/summary', { preHandler: guard }, () => options.stock.summary());
  app.get<{ Params: { productId: string } }>('/stock/:productId', {
    preHandler: guard, schema: { params: { type: 'object', required: ['productId'], properties: { productId: id } } }
  }, (request) => {
    const role = authenticatedUser(request).role;
    return options.stock.detail(request.params.productId, hasPermission(role, 'inventory.movements.read'), hasPermission(role, 'inventory.costs.read'));
  });
}
