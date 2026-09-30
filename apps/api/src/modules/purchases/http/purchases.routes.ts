import {
  PURCHASE_STATUSES, hasPermission,
  type CancelPurchaseRequest, type CreatePurchaseRequest, type PurchaseStatus, type UpdatePurchaseRequest
} from '@lcm/contracts';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { PurchasesService } from '../application/purchases.service.js';

interface Options { readonly authService: AuthService; readonly purchasesService: PurchasesService; }
interface IdParams { readonly id: string; }
interface ListQuery {
  readonly pageSize?: number; readonly nextToken?: string; readonly search?: string;
  readonly supplierId?: string; readonly status?: PurchaseStatus; readonly dateFrom?: string; readonly dateTo?: string;
}
const id = { type: 'string', format: 'uuid' } as const;
const date = { type: 'string', format: 'date' } as const;
const idParams = { type: 'object', required: ['id'], properties: { id } } as const;
const itemSchema = {
  type: 'object', additionalProperties: false,
  required: ['productId', 'presentationId', 'quantity', 'unitPurchasePriceGuarani'],
  properties: {
    productId: id, presentationId: id, quantity: { type: 'integer', minimum: 1, maximum: 1_000_000_000 },
    unitPurchasePriceGuarani: { type: 'integer', minimum: 0, maximum: 9_000_000_000_000 },
    notes: { type: 'string', maxLength: 500 }, sortOrder: { type: 'integer', minimum: 0, maximum: 1_000_000 }
  }
} as const;
const purchaseFields = {
  supplierId: id, supplierInvoiceNumber: { type: 'string', maxLength: 100 },
  purchaseDate: date, expectedDeliveryDate: date,
  discountGuarani: { type: 'integer', minimum: 0, maximum: 9_000_000_000_000 },
  additionalCostsGuarani: { type: 'integer', minimum: 0, maximum: 9_000_000_000_000 },
  notes: { type: 'string', maxLength: 1500 },
  items: { type: 'array', minItems: 0, maxItems: 10, items: itemSchema }
} as const;
const updatePurchaseFields = {
  ...purchaseFields,
  expectedDeliveryDate: { anyOf: [date, { type: 'null' }] }
} as const;

export async function purchasesRoutes(app: FastifyInstance, options: Options): Promise<void> {
  app.get<{ Querystring: ListQuery }>('/', {
    preHandler: requirePermission(options.authService, 'purchases.read'),
    schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      nextToken: { type: 'string', minLength: 1, maxLength: 1000 }, search: { type: 'string', maxLength: 180 },
      supplierId: id, status: { type: 'string', enum: [...PURCHASE_STATUSES] }, dateFrom: date, dateTo: date
    } } }
  }, async (request) => {
    const actor = authenticatedUser(request);
    return options.purchasesService.list({
      limit: request.query.pageSize ?? 25,
      ...(request.query.nextToken ? { nextToken: request.query.nextToken } : {}),
      ...(request.query.search ? { search: request.query.search } : {}),
      ...(request.query.supplierId ? { supplierId: request.query.supplierId } : {}),
      ...(request.query.status ? { status: request.query.status } : {}),
      ...(request.query.dateFrom ? { dateFrom: request.query.dateFrom } : {}),
      ...(request.query.dateTo ? { dateTo: request.query.dateTo } : {})
    }, hasPermission(actor.role, 'purchases.costs.read'));
  });
  app.get<{ Params: IdParams }>('/:id', {
    preHandler: requirePermission(options.authService, 'purchases.read'), schema: { params: idParams }
  }, async (request) => {
    const actor = authenticatedUser(request);
    return options.purchasesService.getById(request.params.id, hasPermission(actor.role, 'purchases.costs.read'));
  });
  app.post<{ Body: CreatePurchaseRequest }>('/', {
    preHandler: requirePermission(options.authService, 'purchases.create'),
    schema: { body: {
      type: 'object', additionalProperties: false,
      required: ['supplierId', 'purchaseDate', 'items'], properties: purchaseFields
    } }
  }, async (request, reply) => reply.status(201).send(
    await options.purchasesService.create(request.body, authenticatedUser(request).userId)
  ));
  app.patch<{ Params: IdParams; Body: UpdatePurchaseRequest }>('/:id', {
    preHandler: requirePermission(options.authService, 'purchases.update'),
    schema: { params: idParams, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: {
      ...updatePurchaseFields, id: { not: {} }, purchaseNumber: { not: {} }, status: { not: {} }, createdAt: { not: {} }, createdBy: { not: {} }
    } } }
  }, async (request) => options.purchasesService.update(
    request.params.id, request.body, authenticatedUser(request).userId
  ));
  app.post<{ Params: IdParams }>('/:id/confirm', {
    preHandler: requirePermission(options.authService, 'purchases.confirm'), schema: { params: idParams }
  }, async (request) => options.purchasesService.confirm(request.params.id, authenticatedUser(request).userId));
  app.post<{ Params: IdParams; Body: CancelPurchaseRequest }>('/:id/cancel', {
    preHandler: requirePermission(options.authService, 'purchases.cancel'),
    schema: { params: idParams, body: {
      type: 'object', additionalProperties: false, properties: { reason: { type: 'string', maxLength: 500 } }
    } }
  }, async (request) => options.purchasesService.cancel(
    request.params.id, request.body ?? {}, authenticatedUser(request).userId
  ));
}
