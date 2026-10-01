import type { FastifyInstance } from 'fastify'; import type { AuthService } from '../../auth/application/auth.service.js'; import { requirePermission } from '../../auth/http/authorization.js'; import type { ReceivingService } from '../application/receiving.service.js';
export async function purchaseReceivingRoutes(app: FastifyInstance, options: { readonly authService: AuthService; readonly service: ReceivingService }): Promise<void> {
  app.get<{ Params: { readonly id: string } }>('/:id/receiving-status', { preHandler: requirePermission(options.authService, 'receipts.read'), schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } } }, async (request) => options.service.receivingStatus(request.params.id));
}
