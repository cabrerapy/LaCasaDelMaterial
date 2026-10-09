import type { FastifyError, FastifyInstance } from 'fastify';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Do not serialize arbitrary errors: messages/stacks can include credentials or payloads.
    request.log.error({ statusCode: error.statusCode ?? 500 }, 'Request failed');
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    const message = statusCode < 500 ? error.message : 'Internal server error';
    void reply.status(statusCode).send({ statusCode, message });
  });
}
