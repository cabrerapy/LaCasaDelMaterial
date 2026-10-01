import { INVENTORY_MOVEMENT_TYPES, hasPermission, type InventoryMovementFilters } from '@lcm/contracts';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { InventoryService } from '../application/inventory.service.js';
export async function inventoryRoutes(app: FastifyInstance, options: { authService: AuthService; inventory: InventoryService }): Promise<void> {
  const id = { type: 'string', format: 'uuid' } as const;
  const guard = requirePermission(options.authService, 'inventory.movements.read');
  app.get<{ Querystring: InventoryMovementFilters }>('/movements', {
    preHandler: guard, schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      productId: id, lotId: id, type: { type: 'string', enum: [...INVENTORY_MOVEMENT_TYPES] },
      sourceType: { type: 'string', enum: ['PURCHASE_RECEIPT'] },
      dateFrom: { type: 'string', format: 'date' }, dateTo: { type: 'string', format: 'date' },
      search: { type: 'string', maxLength: 180 }, pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      nextToken: { type: 'string', maxLength: 2000 }
    } } }
  }, async (request) => options.inventory.list(request.query, hasPermission(authenticatedUser(request).role, 'inventory.costs.read')));
  app.get<{ Params: { id: string } }>('/movements/:id', {
    preHandler: guard, schema: { params: { type: 'object', required: ['id'], properties: { id } } }
  }, async (request) => options.inventory.get(request.params.id, hasPermission(authenticatedUser(request).role, 'inventory.costs.read')));
}
