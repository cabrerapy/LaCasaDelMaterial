import {
  CATEGORY_STATUSES,
  type CategoryStatus,
  type CreateCategoryRequest,
  type UpdateCategoryRequest,
  type UpdateCategoryStatusRequest
} from '@lcm/contracts';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { CategoriesService } from '../application/categories.service.js';

interface CategoriesRouteOptions {
  readonly authService: AuthService;
  readonly categoriesService: CategoriesService;
}
interface IdParams { readonly id: string; }
interface ListQuery {
  readonly pageSize?: number;
  readonly nextToken?: string;
  readonly status?: CategoryStatus;
  readonly search?: string;
}

const idParamsSchema = {
  type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } }
} as const;
const categoryFields = {
  name: { type: 'string', minLength: 2, maxLength: 100 },
  description: { type: 'string', maxLength: 500 },
  sortOrder: { type: 'integer', minimum: 0, maximum: 1_000_000 }
} as const;

export async function categoriesRoutes(
  app: FastifyInstance,
  options: CategoriesRouteOptions
): Promise<void> {
  app.get<{ Querystring: ListQuery }>('/', {
    preHandler: requirePermission(options.authService, 'categories.read'),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
          nextToken: { type: 'string', minLength: 1, maxLength: 1000 },
          status: { type: 'string', enum: [...CATEGORY_STATUSES] },
          search: { type: 'string', maxLength: 100 }
        }
      }
    }
  }, async (request) => options.categoriesService.list({
    limit: request.query.pageSize ?? 25,
    ...(request.query.nextToken ? { nextToken: request.query.nextToken } : {}),
    ...(request.query.status ? { status: request.query.status } : {}),
    ...(request.query.search ? { search: request.query.search } : {})
  }));

  app.get<{ Params: IdParams }>('/:id', {
    preHandler: requirePermission(options.authService, 'categories.read'),
    schema: { params: idParamsSchema }
  }, async (request) => options.categoriesService.getById(request.params.id));

  app.post<{ Body: CreateCategoryRequest }>('/', {
    preHandler: requirePermission(options.authService, 'categories.create'),
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['name'],
        properties: categoryFields
      }
    }
  }, async (request, reply) => reply.status(201).send(
    await options.categoriesService.create(request.body, authenticatedUser(request).userId)
  ));

  app.patch<{ Params: IdParams; Body: UpdateCategoryRequest }>('/:id', {
    preHandler: requirePermission(options.authService, 'categories.update'),
    schema: {
      params: idParamsSchema,
      body: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: categoryFields
      }
    }
  }, async (request) => options.categoriesService.update(
    request.params.id,
    request.body,
    authenticatedUser(request).userId
  ));

  app.patch<{ Params: IdParams; Body: UpdateCategoryStatusRequest }>('/:id/status', {
    preHandler: requirePermission(options.authService, 'categories.disable'),
    schema: {
      params: idParamsSchema,
      body: {
        type: 'object', additionalProperties: false, required: ['status'],
        properties: { status: { type: 'string', enum: [...CATEGORY_STATUSES] } }
      }
    }
  }, async (request) => options.categoriesService.updateStatus(
    request.params.id,
    request.body.status,
    authenticatedUser(request).userId
  ));
}
