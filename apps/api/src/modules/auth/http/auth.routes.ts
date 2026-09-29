import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LoginRequest, LoginResponse } from '@lcm/contracts';
import type { AuthService } from '../application/auth.service.js';
import { AuthenticationError } from '../domain/authentication-error.js';

interface AuthRouteOptions {
  readonly authService: AuthService;
}

const unauthorizedResponse = {
  statusCode: 401,
  message: 'Credenciales inválidas'
} as const;

export async function authRoutes(app: FastifyInstance, options: AuthRouteOptions): Promise<void> {
  app.post<{ Body: LoginRequest; Reply: LoginResponse | typeof unauthorizedResponse }>(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 100 },
            password: { type: 'string', minLength: 1, maxLength: 256 }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const response = await options.authService.login(
          request.body.username,
          request.body.password
        );
        request.log.info({ userId: response.user.id }, 'Login success');
        return response;
      } catch (error: unknown) {
        if (error instanceof AuthenticationError) {
          request.log.warn({ username: request.body.username }, 'Login failed');
          return reply.status(401).send(unauthorizedResponse);
        }
        throw error;
      }
    }
  );

  app.get('/me', async (request, reply) => {
    try {
      return await options.authService.getAuthenticatedUser(request.headers.authorization);
    } catch (error: unknown) {
      return sendUnauthorized(error, request, reply);
    }
  });

  app.get('/protected', async (request, reply) => {
    try {
      await options.authService.authenticate(request.headers.authorization);
      return { status: 'ok' };
    } catch (error: unknown) {
      return sendUnauthorized(error, request, reply);
    }
  });
}

function sendUnauthorized(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply
): typeof unauthorizedResponse {
  if (!(error instanceof AuthenticationError)) {
    throw error;
  }
  request.log.warn('Authentication failed');
  void reply.status(401);
  return unauthorizedResponse;
}
