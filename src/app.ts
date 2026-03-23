import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { HealthController } from './controllers/health.controller';
import { MerchantController } from './controllers/merchant.controller';
import { PaymentController } from './controllers/payment.controller';
import { ProviderController } from './controllers/provider.controller';
import { WebhookController } from './controllers/webhook.controller';
import { errorHandler } from './middleware/error.middleware';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { PayFastProvider, PayUProvider, PeachProvider, StitchProvider } from './providers';
import { healthRoutes } from './routes/health.routes';
import { paymentRoutes } from './routes/payment.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { PaymentService } from './services/payment.service';
import { PaymentProviderName } from './domain/enums';
import {
  InMemoryMerchantRepository,
  InMemoryPaymentLogRepository,
  InMemoryPaymentRepository,
  InMemoryProviderConfigRepository
} from './infrastructure/repositories/in-memory.repositories';
import {
  MongoMerchantRepository,
  MongoPaymentLogRepository,
  MongoPaymentRepository,
  MongoProviderConfigRepository
} from './infrastructure/repositories/mongo.repositories';
import { merchantRoutes } from './routes/merchant.routes';
import { providerRoutes } from './routes/provider.routes';
import { OnboardingService } from './services/onboarding.service';
import { env } from './config/env';
import { logger } from './infrastructure/logger';

const providers = {
  [PaymentProviderName.PAYU]: new PayUProvider(),
  [PaymentProviderName.PAYFAST]: new PayFastProvider(),
  [PaymentProviderName.STITCH]: new StitchProvider(),
  [PaymentProviderName.PEACH]: new PeachProvider()
};

const useMongoPersistence = env.mongo.enabled && env.nodeEnv !== 'test';

const paymentRepository = useMongoPersistence ? new MongoPaymentRepository() : new InMemoryPaymentRepository();
const paymentLogRepository = useMongoPersistence ? new MongoPaymentLogRepository() : new InMemoryPaymentLogRepository();
const providerConfigRepository = useMongoPersistence ? new MongoProviderConfigRepository() : new InMemoryProviderConfigRepository();
const merchantRepository = useMongoPersistence ? new MongoMerchantRepository() : new InMemoryMerchantRepository();

if (useMongoPersistence) {
  logger.info('Mongo persistence enabled', {
    database: env.mongo.databaseName
  });
}

const paymentService = new PaymentService(providers, paymentRepository, paymentLogRepository);
const onboardingService = new OnboardingService(providerConfigRepository, merchantRepository);

const paymentController = new PaymentController(paymentService);
const providerController = new ProviderController(onboardingService);
const merchantController = new MerchantController(onboardingService);
const webhookController = new WebhookController(paymentService);
const healthController = new HealthController();

export const app = express();

app.use(helmet());
app.use(morgan('combined'));
app.use(requestIdMiddleware);
app.use(express.json());

app.use(paymentRoutes(paymentController));
app.use(providerRoutes(providerController));
app.use(merchantRoutes(merchantController));
app.use(webhookRoutes(webhookController));
app.use(healthRoutes(healthController));

app.use(errorHandler);
