import {
  BASE_UNITS,
  PRODUCT_STATUSES,
  hasPermission,
  type CreateProductPresentationRequest,
  type CreateProductRequest,
  type ProductStatus,
  type UpdatePresentationStatusRequest,
  type UpdateProductPresentationRequest,
  type UpdateProductRequest,
  type UpdateProductStatusRequest
} from '@lcm/contracts';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { ProductsService } from '../application/products.service.js';

interface Options { readonly authService: AuthService; readonly productsService: ProductsService; }
interface IdParams { readonly id: string; }
interface PresentationParams extends IdParams { readonly presentationId: string; }
interface ListQuery {
  readonly pageSize?: number;
  readonly nextToken?: string;
  readonly search?: string;
  readonly categoryId?: string;
  readonly status?: ProductStatus;
}

const id = { type: 'string', format: 'uuid' } as const;
const idParams = { type: 'object', required: ['id'], properties: { id } } as const;
const presentationParams = {
  type: 'object', required: ['id', 'presentationId'], properties: { id, presentationId: id }
} as const;
const nullableText = { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] } as const;
const presentationFields = {
  name: { type: 'string', minLength: 1, maxLength: 120 },
  sku: nullableText,
  barcode: nullableText,
  baseQuantity: { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000_000 },
  salePriceGuarani: { type: 'integer', minimum: 0, maximum: 9_000_000_000_000 },
  isDefault: { type: 'boolean' },
  sortOrder: { type: 'integer', minimum: 0, maximum: 1_000_000 }
} as const;

export async function productsRoutes(app: FastifyInstance, options: Options): Promise<void> {
  app.get<{ Querystring: ListQuery }>('/', {
    preHandler: requirePermission(options.authService, 'products.read'),
    schema: { querystring: {
      type: 'object', additionalProperties: false,
      properties: {
        pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        nextToken: { type: 'string', minLength: 1, maxLength: 1000 },
        search: { type: 'string', maxLength: 120 }, categoryId: id,
        status: { type: 'string', enum: [...PRODUCT_STATUSES] }
      }
    } }
  }, async (request) => options.productsService.list({
    limit: request.query.pageSize ?? 25,
    ...(request.query.nextToken ? { nextToken: request.query.nextToken } : {}),
    ...(request.query.search ? { search: request.query.search } : {}),
    ...(request.query.categoryId ? { categoryId: request.query.categoryId } : {}),
    ...(request.query.status ? { status: request.query.status } : {})
  }));

  app.get<{ Params: IdParams }>('/:id', {
    preHandler: requirePermission(options.authService, 'products.read'), schema: { params: idParams }
  }, async (request) => options.productsService.getById(request.params.id));

  app.post<{ Body: CreateProductRequest }>('/', {
    preHandler: requirePermission(options.authService, 'products.create'),
    schema: { body: {
      type: 'object', additionalProperties: false,
      required: ['code', 'name', 'categoryId', 'baseUnit', 'quantityScale', 'minStock', 'presentations'],
      properties: {
        code: { type: 'string', minLength: 1, maxLength: 50 },
        name: { type: 'string', minLength: 2, maxLength: 150 },
        description: { type: 'string', maxLength: 1000 }, categoryId: id,
        baseUnit: { type: 'string', enum: [...BASE_UNITS] },
        quantityScale: { type: 'integer', minimum: 1, maximum: 1_000_000 },
        minStock: { type: 'number', minimum: 0, maximum: 1_000_000_000 },
        trackStock: { type: 'boolean', default: true },
        weightPerBaseUnitGrams: { type: 'integer', minimum: 1 },
        volumePerBaseUnitMl: { type: 'integer', minimum: 1 },
        presentations: {
          type: 'array', minItems: 1, maxItems: 7,
          items: {
            type: 'object', additionalProperties: false,
            required: ['name', 'baseQuantity', 'salePriceGuarani'], properties: presentationFields
          }
        }
      }
    } }
  }, async (request, reply) => reply.status(201).send(
    await options.productsService.create(request.body, authenticatedUser(request).userId)
  ));

  app.patch<{ Params: IdParams; Body: UpdateProductRequest }>('/:id', {
    preHandler: requirePermission(options.authService, 'products.update'),
    schema: { params: idParams, body: {
      type: 'object', additionalProperties: false, minProperties: 1,
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 150 },
        description: { type: 'string', maxLength: 1000 }, categoryId: id,
        minStock: { type: 'number', minimum: 0, maximum: 1_000_000_000 },
        trackStock: { type: 'boolean' },
        weightPerBaseUnitGrams: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
        volumePerBaseUnitMl: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
        code: { not: {} }, baseUnit: { not: {} }, quantityScale: { not: {} },
        status: { not: {} }, createdAt: { not: {} }, createdBy: { not: {} }, id: { not: {} }
      }
    } }
  }, async (request) => options.productsService.update(
    request.params.id, request.body, authenticatedUser(request).userId
  ));

  app.patch<{ Params: IdParams; Body: UpdateProductStatusRequest }>('/:id/status', {
    preHandler: requirePermission(options.authService, 'products.disable'),
    schema: { params: idParams, body: statusBodySchema }
  }, async (request) => options.productsService.updateStatus(
    request.params.id, request.body.status, authenticatedUser(request).userId
  ));

  app.get<{ Params: IdParams }>('/:id/presentations', {
    preHandler: requirePermission(options.authService, 'products.read'), schema: { params: idParams }
  }, async (request) => options.productsService.listPresentations(request.params.id));

  app.post<{ Params: IdParams; Body: CreateProductPresentationRequest }>('/:id/presentations', {
    preHandler: requirePermission(options.authService, 'products.update'),
    schema: { params: idParams, body: {
      type: 'object', additionalProperties: false,
      required: ['name', 'baseQuantity', 'salePriceGuarani'], properties: presentationFields
    } }
  }, async (request, reply) => reply.status(201).send(await options.productsService.createPresentation(
    request.params.id, request.body, authenticatedUser(request).userId
  )));

  app.patch<{ Params: PresentationParams; Body: UpdateProductPresentationRequest }>(
    '/:id/presentations/:presentationId',
    {
      preHandler: requirePermission(options.authService, 'products.update'),
      schema: { params: presentationParams, body: {
        type: 'object', additionalProperties: false, minProperties: 1, properties: presentationFields
      } }
    },
    async (request) => {
      const actor = authenticatedUser(request);
      return options.productsService.updatePresentation(
        request.params.id, request.params.presentationId, request.body, actor.userId,
        hasPermission(actor.role, 'products.prices.manage')
      );
    }
  );

  app.patch<{ Params: PresentationParams; Body: UpdatePresentationStatusRequest }>(
    '/:id/presentations/:presentationId/status',
    {
      preHandler: requirePermission(options.authService, 'products.update'),
      schema: { params: presentationParams, body: statusBodySchema }
    },
    async (request) => options.productsService.updatePresentationStatus(
      request.params.id, request.params.presentationId, request.body.status,
      authenticatedUser(request).userId
    )
  );
}

const statusBodySchema = {
  type: 'object', additionalProperties: false, required: ['status'],
  properties: { status: { type: 'string', enum: [...PRODUCT_STATUSES] } }
} as const;
