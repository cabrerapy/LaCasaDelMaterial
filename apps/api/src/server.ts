import { createApp } from './app/create-app.js';
import { loadConfig } from './config/environment.js';

async function start(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error: unknown) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
