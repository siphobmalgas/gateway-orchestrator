import { PaymentProviderName } from '../../domain/enums';
import { logger } from '../logger';
import { env } from '../../config/env';
import { OnboardingService, RegisterProviderInput } from '../../services/onboarding.service';

const hasExplicitEnvValues = (...keys: string[]): boolean => keys.every((key) => Boolean(process.env[key]));

const buildSeedProviderInputs = (): RegisterProviderInput[] => {
  const merchantIdentifier = env.mongo.defaultMerchantIdentifier;
  const merchantName = env.mongo.defaultMerchantName;
  const credentials: RegisterProviderInput[] = [
    {
      provider: PaymentProviderName.PAYU,
      merchantIdentifier,
      merchantName,
      payuCredentials: {
        username: env.payu.soapUsername,
        password: env.payu.soapPassword,
        safekey: env.payu.safekey,
        baseUrl: env.payu.baseUrl,
        redirectBaseUrl: env.payu.rppRedirectBaseUrl,
        defaultReturnUrl: env.payu.defaultReturnUrl,
        defaultCancelUrl: env.payu.defaultCancelUrl,
        defaultNotificationUrl: env.payu.defaultNotificationUrl,
        webhookSecret: env.payu.webhookSecret
      },
      metadata: {
        source: 'env-bootstrap'
      }
    }
  ];

  if (hasExplicitEnvValues('PAYFAST_API_KEY', 'PAYFAST_WEBHOOK_SECRET')) {
    credentials.push({
      provider: PaymentProviderName.PAYFAST,
      merchantIdentifier,
      merchantName,
      payfastCredentials: {
        apiKey: env.payfast.apiKey,
        baseUrl: env.payfast.baseUrl,
        webhookSecret: env.payfast.webhookSecret
      },
      metadata: {
        source: 'env-bootstrap'
      }
    });
  }

  if (hasExplicitEnvValues('PAYFLEX_CLIENT_ID', 'PAYFLEX_CLIENT_SECRET', 'PAYFLEX_WEBHOOK_SECRET')) {
    credentials.push({
      provider: PaymentProviderName.PAYFLEX,
      merchantIdentifier,
      merchantName,
      payflexCredentials: {
        clientId: env.payflex.clientId,
        clientSecret: env.payflex.clientSecret,
        authUrl: env.payflex.authUrl,
        audience: env.payflex.audience,
        baseUrl: env.payflex.baseUrl,
        apiKey: env.payflex.apiKey,
        webhookSecret: env.payflex.webhookSecret
      },
      metadata: {
        source: 'env-bootstrap'
      }
    });
  }

  if (hasExplicitEnvValues('STITCH_API_KEY', 'STITCH_WEBHOOK_SECRET')) {
    credentials.push({
      provider: PaymentProviderName.STITCH,
      merchantIdentifier,
      merchantName,
      stitchCredentials: {
        apiKey: env.stitch.apiKey,
        baseUrl: env.stitch.baseUrl,
        webhookSecret: env.stitch.webhookSecret
      },
      metadata: {
        source: 'env-bootstrap'
      }
    });
  }

  if (hasExplicitEnvValues('PEACH_API_KEY', 'PEACH_WEBHOOK_SECRET')) {
    credentials.push({
      provider: PaymentProviderName.PEACH,
      merchantIdentifier,
      merchantName,
      peachCredentials: {
        apiKey: env.peach.apiKey,
        baseUrl: env.peach.baseUrl,
        webhookSecret: env.peach.webhookSecret
      },
      metadata: {
        source: 'env-bootstrap'
      }
    });
  }

  return credentials;
};

export const seedMongoConfiguration = async (onboardingService: OnboardingService): Promise<void> => {
  if (!env.mongo.enabled) {
    return;
  }

  const merchantIdentifier = env.mongo.defaultMerchantIdentifier;
  const merchantName = env.mongo.defaultMerchantName;

  await onboardingService.createMerchant({
    merchantIdentifier,
    merchantName,
    metadata: {
      source: 'env-bootstrap'
    }
  });

  const seededProviders: PaymentProviderName[] = [];
  for (const input of buildSeedProviderInputs()) {
    await onboardingService.registerProvider(input);
    seededProviders.push(input.provider);
  }

  logger.info('Mongo provider credentials bootstrapped', {
    merchantIdentifier,
    seededProviders
  });
};