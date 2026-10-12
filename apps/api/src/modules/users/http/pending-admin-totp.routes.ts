import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PendingAdminTotp } from '../application/pending-admin-totp.js';
import { UserApplicationError } from '../application/user-application-error.js';
import { AuthenticationError } from '../../auth/domain/authentication-error.js';

async function enrollmentRequest<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error: unknown) {
    if (error instanceof AuthenticationError) throw new UserApplicationError('Credenciales inválidas', 401);
    throw error;
  }
}

export async function pendingAdminTotpRoutes(app: FastifyInstance,
  options: { enrollment: Pick<PendingAdminTotp, 'begin' | 'complete'> }): Promise<void> {
  const strictBody = (allowed: readonly string[]) => async (request: FastifyRequest) => {
    if (request.body && typeof request.body === 'object' &&
      Object.keys(request.body).some(key => !allowed.includes(key))) throw new UserApplicationError('Campos no permitidos', 400);
    if (Object.keys(request.query as object).length) throw new UserApplicationError('No se permiten parámetros de consulta', 400);
  };
  const confidential = async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
  };
  // Enrollment never creates an application session. Sensitive routes omit logs.
  app.post('/begin', { logLevel: 'silent', bodyLimit: 512, onRequest: confidential,
    preValidation: strictBody([]), schema: { body: { type: 'object', maxProperties: 0, additionalProperties: false } }
  }, request => enrollmentRequest(() => options.enrollment.begin(request.headers.authorization)));
  app.post<{ Body: { code: string } }>('/complete', {
    logLevel: 'silent', bodyLimit: 512, onRequest: confidential, preValidation: strictBody(['code']),
    schema: { body: { type: 'object', additionalProperties: false, required: ['code'],
      properties: { code: { type: 'string', pattern: '^[0-9]{6}$', minLength: 6, maxLength: 6 } } } }
  }, request => enrollmentRequest(() => options.enrollment.complete(request.headers.authorization, request.body.code)));
}
