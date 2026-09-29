import {
  SUPPLIER_STATUSES,
  type CreateSupplierRequest,
  type SupplierStatus,
  type UpdateSupplierRequest,
  type UpdateSupplierStatusRequest
} from '@lcm/contracts';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { SuppliersService } from '../application/suppliers.service.js';

interface Options { readonly authService: AuthService; readonly suppliersService: SuppliersService; }
interface IdParams { readonly id: string; }
interface ListQuery { readonly pageSize?: number; readonly nextToken?: string; readonly search?: string; readonly status?: SupplierStatus; }
const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } as const;
const fields = {
  businessName: { type: 'string', minLength: 2, maxLength: 180 },
  tradeName: { type: 'string', maxLength: 180 }, taxId: { type: 'string', maxLength: 40 },
  phone: { type: 'string', maxLength: 50 }, email: { type: 'string', format: 'email', maxLength: 254 },
  address: { type: 'string', maxLength: 300 }, city: { type: 'string', maxLength: 120 },
  notes: { type: 'string', maxLength: 1500 }
} as const;

export async function suppliersRoutes(app: FastifyInstance, options: Options): Promise<void> {
  app.get<{ Querystring: ListQuery }>('/', {
    preHandler: requirePermission(options.authService, 'suppliers.read'),
    schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      nextToken: { type: 'string', minLength: 1, maxLength: 1000 }, search: { type: 'string', maxLength: 180 },
      status: { type: 'string', enum: [...SUPPLIER_STATUSES] }
    } } }
  }, async (request) => options.suppliersService.list({
    limit: request.query.pageSize ?? 25,
    ...(request.query.nextToken ? { nextToken: request.query.nextToken } : {}),
    ...(request.query.search ? { search: request.query.search } : {}),
    ...(request.query.status ? { status: request.query.status } : {})
  }));
  app.get<{ Params: IdParams }>('/:id', {
    preHandler: requirePermission(options.authService, 'suppliers.read'), schema: { params: idParams }
  }, async (request) => options.suppliersService.getById(request.params.id));
  app.post<{ Body: CreateSupplierRequest }>('/', {
    preHandler: requirePermission(options.authService, 'suppliers.create'),
    schema: { body: { type: 'object', additionalProperties: false, required: ['businessName'], properties: fields } }
  }, async (request, reply) => reply.status(201).send(
    await options.suppliersService.create(request.body, authenticatedUser(request).userId)
  ));
  app.patch<{ Params: IdParams; Body: UpdateSupplierRequest }>('/:id', {
    preHandler: requirePermission(options.authService, 'suppliers.update'),
    schema: { params: idParams, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: {
      ...fields, id: { not: {} }, status: { not: {} }, createdAt: { not: {} }, createdBy: { not: {} }
    } } }
  }, async (request) => options.suppliersService.update(
    request.params.id, request.body, authenticatedUser(request).userId
  ));
  app.patch<{ Params: IdParams; Body: UpdateSupplierStatusRequest }>('/:id/status', {
    preHandler: requirePermission(options.authService, 'suppliers.disable'),
    schema: { params: idParams, body: {
      type: 'object', additionalProperties: false, required: ['status'],
      properties: { status: { type: 'string', enum: [...SUPPLIER_STATUSES] } }
    } }
  }, async (request) => options.suppliersService.updateStatus(
    request.params.id, request.body.status, authenticatedUser(request).userId
  ));
}
