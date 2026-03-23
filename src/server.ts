import { env } from './config/env';
import { logger } from './infrastructure/logger';
import { app } from './app';

app.listen(env.port, () => {
  logger.info('Payment orchestrator listening', { port: env.port, environment: env.nodeEnv });
});
