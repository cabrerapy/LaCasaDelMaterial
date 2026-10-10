import awsLambdaFastify from '@fastify/aws-lambda';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { FastifyInstance } from 'fastify';

// Inject composition explicitly: never import server.ts (local provisioning/listen).
export function createLambdaHandler(buildApp: () => Promise<FastifyInstance>) {
  let initialized: Promise<awsLambdaFastify.PromiseHandler<APIGatewayProxyEventV2>> | undefined;
  async function initialize() {
    const app = await buildApp();
    try {
      const proxy = awsLambdaFastify<APIGatewayProxyEventV2>(app, {
        serializeLambdaArguments: false,
        decorateRequest: true,
        parseCommaSeparatedQueryParams: false,
        binaryMimeTypes: ['application/octet-stream', 'application/pdf', 'image/png', 'image/jpeg']
      });
      // Adapter decoration must precede ready().
      await app.ready();
      return proxy;
    } catch (error: unknown) {
      await app.close();
      throw error;
    }
  }
  const handler: awsLambdaFastify.PromiseHandler<APIGatewayProxyEventV2> = async (event, context) => {
    if (event.version !== '2.0') throw new Error('Only HTTP API payload format 2.0 is supported');
    // Cache failures as well: do not repeatedly initialize a broken container.
    initialized ??= initialize();
    return (await initialized)(event, context);
  };
  return handler;
}
