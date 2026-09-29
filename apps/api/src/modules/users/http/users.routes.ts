import {
  USER_ROLES,
  USER_STATUSES,
  type CreateUserRequest,
  type UpdateUserRequest,
  type UpdateUserStatusRequest
} from '@lcm/contracts';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { UsersService } from '../application/users.service.js';

interface UsersRouteOptions {
  readonly authService: AuthService;
  readonly usersService: UsersService;
}

interface IdParams { readonly id: string; }
interface ListQuery { readonly pageSize?: number; readonly nextToken?: string; }

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } }
} as const;

const editableProperties = {
  name: { type: 'string', minLength: 2, maxLength: 120 },
  email: { type: 'string', format: 'email', maxLength: 254 },
  role: { type: 'string', enum: [...USER_ROLES] }
} as const;

export async function usersRoutes(app: FastifyInstance, options: UsersRouteOptions): Promise<void> {
  app.get<{ Querystring: ListQuery }>(
    '/',
    {
      preHandler: requirePermission(options.authService, 'users.read'),
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
            nextToken: { type: 'string', minLength: 1, maxLength: 1000 }
          }
        }
      }
    },
    async (request) => options.usersService.list(
      request.query.pageSize ?? 25,
      request.query.nextToken
    )
  );

  app.get<{ Params: IdParams }>(
    '/:id',
    {
      preHandler: requirePermission(options.authService, 'users.read'),
      schema: { params: idParamsSchema }
    },
    async (request) => options.usersService.getById(request.params.id)
  );

  app.post<{ Body: CreateUserRequest }>(
    '/',
    {
      preHandler: requirePermission(options.authService, 'users.create'),
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'username', 'email', 'password', 'role'],
          properties: {
            name: editableProperties.name,
            username: {
              type: 'string',
              minLength: 3,
              maxLength: 40,
              pattern: '^[a-zA-Z0-9._-]+$'
            },
            email: editableProperties.email,
            password: {
              type: 'string',
              minLength: 10,
              maxLength: 256,
              pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).+$'
            },
            role: editableProperties.role
          }
        }
      }
    },
    async (request, reply) => {
      const created = await options.usersService.create(
        request.body,
        authenticatedUser(request).userId
      );
      return reply.status(201).send(created);
    }
  );

  app.patch<{ Params: IdParams; Body: UpdateUserRequest }>(
    '/:id',
    {
      preHandler: requirePermission(options.authService, 'users.update'),
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: editableProperties
        }
      }
    },
    async (request) => options.usersService.update(
      request.params.id,
      request.body,
      authenticatedUser(request).userId
    )
  );

  app.patch<{ Params: IdParams; Body: UpdateUserStatusRequest }>(
    '/:id/status',
    {
      preHandler: requirePermission(options.authService, 'users.disable'),
      schema: {
        params: idParamsSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: { status: { type: 'string', enum: [...USER_STATUSES] } }
        }
      }
    },
    async (request) => options.usersService.updateStatus(
      request.params.id,
      request.body.status,
      authenticatedUser(request).userId
    )
  );
}
