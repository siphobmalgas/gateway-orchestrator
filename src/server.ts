import { env } from './config/env';
import { logger } from './infrastructure/logger';
import { seedMongoConfiguration } from './infrastructure/bootstrap/mongo-config.bootstrap';
import { initializeMySqlPersistence } from './infrastructure/db/mysql.client';
import { app, onboardingService } from './app';

const start = async (): Promise<void> => {
  if (env.mongo.enabled && env.nodeEnv !== 'test') {
    await seedMongoConfiguration(onboardingService);
  }

  if (env.mysql.enabled && env.nodeEnv !== 'test') {
    await initializeMySqlPersistence();
  }

  app.listen(env.port, () => {
    logger.info('Payment orchestrator listening', { port: env.port, environment: env.nodeEnv });
  });
};

void start().catch((error: unknown) => {
  logger.error('Failed to start payment orchestrator', {
    message: error instanceof Error ? error.message : 'Unknown startup error'
  });
  process.exit(1);
});
