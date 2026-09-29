import { hasPermission, type Permission } from '@lcm/contracts';
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { AuthService } from '../application/auth.service.js';
import type { AuthenticatedUser } from '../domain/authenticated-user.js';
import { AuthenticationError } from '../domain/authentication-error.js';

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedUser?: AuthenticatedUser;
  }
}

export function requirePermission(
  authService: AuthService,
  permission: Permission
): preHandlerHookHandler {
  return async (request, reply) => {
    try {
      const user = await authService.authenticate(request.headers.authorization);
      request.authenticatedUser = user;
      if (!hasPermission(user.role, permission)) {
        await reply.status(403).send({ statusCode: 403, message: 'Acceso no autorizado' });
      }
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) {
        await reply.status(401).send({ statusCode: 401, message: 'Credenciales inválidas' });
        return;
      }
      throw error;
    }
  };
}

export function authenticatedUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.authenticatedUser) {
    throw new AuthenticationError();
  }
  return request.authenticatedUser;
}
