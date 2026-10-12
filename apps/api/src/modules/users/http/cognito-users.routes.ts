import { USER_ROLES, type CreateUserRequest } from '@lcm/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { StageCognitoUser } from '../application/stage-cognito-user.js';
import type { InviteCognitoUser } from '../application/invite-cognito-user.js';
import type { ActivateCognitoUser } from '../application/activate-cognito-user.js';
import type { DeactivateCognitoUser } from '../application/deactivate-cognito-user.js';
import { UserApplicationError } from '../application/user-application-error.js';

export interface CognitoUserLifecycle {
  readonly requireAdministratorMfa: (userId: string) => Promise<void>;
  readonly stage: Pick<StageCognitoUser, 'execute'>;
  readonly invite: Pick<InviteCognitoUser, 'execute'>;
  readonly activate: Pick<ActivateCognitoUser, 'execute'>;
  readonly deactivate: Pick<DeactivateCognitoUser, 'execute'>;
}
interface IdParams { id: string; }
const params = { type: 'object', additionalProperties: false, required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } } } as const;
const emptyBody = { type: 'object', additionalProperties: false, maxProperties: 0 } as const;
function strictBody(allowed: readonly string[]) {
  return async (request: FastifyRequest) => {
    if (request.body !== null && typeof request.body === 'object' &&
      Object.keys(request.body).some(key => !allowed.includes(key))) {
      throw new UserApplicationError('Campos no permitidos', 400);
    }
  };
}

// Separate endpoints: never invoke local password/status mutations for Cognito.
export async function cognitoUsersRoutes(app: FastifyInstance,
  options: { authService: AuthService; lifecycle: CognitoUserLifecycle }): Promise<void> {
  const adminOnly = async (request: FastifyRequest) => {
    if (authenticatedUser(request).role !== 'ADMIN') throw new UserApplicationError('Acceso denegado', 403);
    await options.lifecycle.requireAdministratorMfa(authenticatedUser(request).userId);
  };
  const authorize = [requirePermission(options.authService, 'users.create'), adminOnly];
  app.post<{ Params: IdParams; Body: { reason: string } }>('/:id/deactivation', {
    preValidation: strictBody(['reason']),
    preHandler: [requirePermission(options.authService, 'users.disable'), adminOnly],
    schema: { params, body: { type: 'object', additionalProperties: false, required: ['reason'],
      properties: { reason: { type: 'string', minLength: 5, maxLength: 500 } } } }
  }, request => options.lifecycle.deactivate.execute(request.params.id, authenticatedUser(request).userId, request.body.reason));
  app.post<{ Body: Omit<CreateUserRequest, 'password'> }>('/', {
    preValidation: strictBody(['name', 'username', 'email', 'role']), preHandler: authorize,
    schema: { body: { type: 'object', additionalProperties: false,
      required: ['name', 'username', 'email', 'role'], properties: {
        name: { type: 'string', minLength: 2, maxLength: 120 },
        username: { type: 'string', minLength: 3, maxLength: 40, pattern: '^[a-zA-Z0-9._-]+$' },
        email: { type: 'string', format: 'email', maxLength: 254 },
        role: { type: 'string', enum: [...USER_ROLES] }
      } } }
  }, async (request, reply) => reply.code(201).send(await options.lifecycle.stage.execute(
    request.body, authenticatedUser(request).userId)));
  app.post<{ Params: IdParams }>('/:id/invitation', {
    preValidation: strictBody([]), preHandler: authorize, schema: { params, body: emptyBody }
  }, async (request, reply) => reply.code(202).send(await options.lifecycle.invite.execute(
    request.params.id, authenticatedUser(request).userId)));
  app.post<{ Params: IdParams }>('/:id/activation', {
    preValidation: strictBody([]), preHandler: authorize, schema: { params, body: emptyBody }
  }, request => options.lifecycle.activate.execute(request.params.id, authenticatedUser(request).userId));
}
