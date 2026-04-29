import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { HealthController } from './controllers/health.controller';
import { MerchantController } from './controllers/merchant.controller';
import { PaymentController } from './controllers/payment.controller';
import { ProviderController } from './controllers/provider.controller';
import { RoutingController } from './controllers/routing.controller';
import { WebhookController } from './controllers/webhook.controller';
import { errorHandler } from './middleware/error.middleware';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { healthRoutes } from './routes/health.routes';
import { paymentRoutes } from './routes/payment.routes';
import { routingRoutes } from './routes/routing.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { PaymentService } from './services/payment.service';
import {
  InMemoryMerchantRepository,
  InMemoryMerchantNotificationRepository,
  InMemoryPaymentLogRepository,
  InMemoryPaymentOperationRepository,
  InMemoryPaymentRepository,
  InMemoryProviderConfigRepository,
  InMemoryWebhookEventRepository
} from './infrastructure/repositories/in-memory.repositories';
import {
  MongoMerchantRepository,
  MongoPaymentLogRepository,
  MongoPaymentOperationRepository,
  MongoPaymentRepository,
  MongoProviderConfigRepository,
  MongoWebhookEventRepository
} from './infrastructure/repositories/mongo.repositories';
import {
  MySqlMerchantRepository,
  MySqlMerchantNotificationRepository,
  MySqlPaymentLogRepository,
  MySqlPaymentOperationRepository,
  MySqlPaymentRepository,
  MySqlWebhookEventRepository
} from './infrastructure/repositories/mysql.repositories';
import { createProviderRegistry } from './infrastructure/provider-registry';
import { merchantRoutes } from './routes/merchant.routes';
import { providerRoutes } from './routes/provider.routes';
import { OnboardingService } from './services/onboarding.service';
import { RoutingService } from './services/routing.service';
import { MerchantNotificationService } from './services/merchant-notification.service';
import { PaymentPollerService } from './services/payment-poller.service';
import { DEFAULT_PAYMENT_POLLING_CONFIG } from './utils/payment-polling';
import { env } from './config/env';
import { logger } from './infrastructure/logger';

const providers = createProviderRegistry();

const useMongoPersistence = env.mongo.enabled && env.nodeEnv !== 'test';
const useMySqlPersistence = env.mysql.enabled && env.nodeEnv !== 'test';
const useMongoTransactionPersistence = !useMySqlPersistence && useMongoPersistence;

const paymentRepository = useMySqlPersistence
  ? new MySqlPaymentRepository()
  : useMongoTransactionPersistence
    ? new MongoPaymentRepository()
    : new InMemoryPaymentRepository();
const paymentLogRepository = useMySqlPersistence
  ? new MySqlPaymentLogRepository()
  : useMongoTransactionPersistence
    ? new MongoPaymentLogRepository()
    : new InMemoryPaymentLogRepository();
const paymentOperationRepository = useMySqlPersistence
  ? new MySqlPaymentOperationRepository()
  : useMongoTransactionPersistence
    ? new MongoPaymentOperationRepository()
    : new InMemoryPaymentOperationRepository();
const webhookEventRepository = useMySqlPersistence
  ? new MySqlWebhookEventRepository()
  : useMongoTransactionPersistence
    ? new MongoWebhookEventRepository()
    : new InMemoryWebhookEventRepository();
const providerConfigRepository = useMongoPersistence ? new MongoProviderConfigRepository() : new InMemoryProviderConfigRepository();
const merchantRepository = useMySqlPersistence
  ? new MySqlMerchantRepository()
  : useMongoPersistence
    ? new MongoMerchantRepository()
    : new InMemoryMerchantRepository();
const merchantNotificationRepository = useMySqlPersistence
  ? new MySqlMerchantNotificationRepository()
  : new InMemoryMerchantNotificationRepository();

if (useMongoPersistence) {
  logger.info(useMySqlPersistence ? 'Mongo configuration persistence enabled' : 'Mongo persistence enabled', {
    database: env.mongo.databaseName
  });
}

if (useMySqlPersistence) {
  logger.info('MySQL transaction persistence enabled', {
    database: env.mysql.databaseName
  });
}

export const onboardingService = new OnboardingService(providerConfigRepository, merchantRepository);
const routingService = new RoutingService(providerConfigRepository, merchantRepository);
const merchantNotificationService = new MerchantNotificationService(merchantRepository, merchantNotificationRepository);
const paymentService = new PaymentService(
  providers,
  paymentRepository,
  paymentLogRepository,
  paymentOperationRepository,
  webhookEventRepository,
  routingService,
  providerConfigRepository,
  merchantNotificationService
);

const paymentController = new PaymentController(paymentService);
const providerController = new ProviderController(onboardingService);
const merchantController = new MerchantController(onboardingService);
const routingController = new RoutingController(onboardingService);
const webhookController = new WebhookController(paymentService);
const healthController = new HealthController();

export const app = express();

app.use(helmet());
app.use(morgan('combined'));
app.use(requestIdMiddleware);

app.use(webhookRoutes(webhookController));
app.use(express.json());

app.use(paymentRoutes(paymentController));
app.use(providerRoutes(providerController));
app.use(merchantRoutes(merchantController));
app.use(routingRoutes(routingController));
app.use(healthRoutes(healthController));

app.use(errorHandler);

export const paymentPoller = new PaymentPollerService(
  paymentService,
  paymentRepository,
  {
    enabled: env.polling.enabled,
    intervalMs: env.polling.intervalMs,
    batchSize: env.polling.batchSize,
    pollingConfig: DEFAULT_PAYMENT_POLLING_CONFIG
  }
);
