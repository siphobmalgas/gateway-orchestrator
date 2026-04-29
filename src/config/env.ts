import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envCandidates = [
  process.env.ENV_FILE,
  '.env',
  '.env.local'
].filter((value): value is string => Boolean(value));

let loadedEnvFile: string | null = null;

for (const envFile of envCandidates) {
  const absolutePath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(absolutePath)) {
    continue;
  }

  dotenv.config({ path: absolutePath, override: false });
  loadedEnvFile = absolutePath;
}

if (!loadedEnvFile) {
  console.warn('[config] No .env file found. Expected .env, .env.local, or ENV_FILE path. Using process/default values.');
}

const requireEnv = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const defaultPublicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'https://merchant.example.com';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  publicBaseUrl: defaultPublicBaseUrl,
  log: {
    level: (process.env.LOG_LEVEL ?? 'debug').toLowerCase(),
    toFile: (process.env.LOG_TO_FILE ?? 'false').toLowerCase() === 'true',
    filePath: process.env.LOG_FILE_PATH ?? 'logs/app.log'
  },
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 10000),
  maxRetryAttempts: Number(process.env.MAX_RETRY_ATTEMPTS ?? 3),
  mongo: {
    enabled: (process.env.MONGO_ENABLED ?? 'false').toLowerCase() === 'true',
    uri: process.env.MONGO_URI ?? 'mongodb://provider_creds_user:provider_creds_pass001@localhost:27017/provider-cred-db?authSource=provider-cred-db',
    databaseName: process.env.MONGO_DB_NAME ?? 'provider-cred-db'
  },
  payu: {
    baseUrl: process.env.PAYU_BASE_URL ?? 'https://staging.payu.co.za/service/PayUAPI',
    safekey: process.env.PAYU_SAFEKEY ?? '{07F70723-1B96-4B97-B891-7BF708594EEA}',
    soapUsername: process.env.PAYU_SOAP_USERNAME ?? '200021',
    soapPassword: process.env.PAYU_SOAP_PASSWORD ?? 'WSAUFbw6',
    rppRedirectBaseUrl: process.env.PAYU_RPP_REDIRECT_BASE_URL ?? 'https://staging.payu.co.za/rpp.do',
    defaultReturnUrl: process.env.PAYU_RETURN_URL ?? `${defaultPublicBaseUrl}/payu/return`,
    defaultCancelUrl: process.env.PAYU_CANCEL_URL ?? `${defaultPublicBaseUrl}/payu/cancel`,
    defaultNotificationUrl: process.env.PAYU_NOTIFICATION_URL ?? `${defaultPublicBaseUrl}/webhooks/payu`,
    webhookSecret: requireEnv(process.env.PAYU_WEBHOOK_SECRET ?? 'payu_dev_secret', 'PAYU_WEBHOOK_SECRET')
  },
  payfast: {
    baseUrl: process.env.PAYFAST_BASE_URL ?? 'https://sandbox.payfast.example',
    apiKey: process.env.PAYFAST_API_KEY ?? '',
    webhookSecret: requireEnv(process.env.PAYFAST_WEBHOOK_SECRET ?? 'payfast_dev_secret', 'PAYFAST_WEBHOOK_SECRET')
  },
  payflex: {
    baseUrl: process.env.PAYFLEX_BASE_URL ?? 'https://api.uat.payflex.co.za',
    apiKey: process.env.PAYFLEX_API_KEY ?? '',
    authUrl: process.env.PAYFLEX_AUTH_URL ?? 'https://auth-uat.payflex.co.za/auth/merchant',
    audience: process.env.PAYFLEX_AUDIENCE ?? 'https://auth-dev.payflex.co.za',
    clientId: process.env.PAYFLEX_CLIENT_ID ?? 'payflex_client_id',
    clientSecret: process.env.PAYFLEX_CLIENT_SECRET ?? 'payflex_client_secret',
    defaultRedirectConfirmUrl: process.env.PAYFLEX_CONFIRM_URL ?? `${defaultPublicBaseUrl}/payflex/confirm`,
    defaultRedirectCancelUrl: process.env.PAYFLEX_CANCEL_URL ?? `${defaultPublicBaseUrl}/payflex/cancel`,
    defaultStatusCallbackUrl: process.env.PAYFLEX_STATUS_CALLBACK_URL ?? `${defaultPublicBaseUrl}/webhooks/payflex`,
    defaultRefundWebhookUrl: process.env.PAYFLEX_REFUND_WEBHOOK_URL ?? `${defaultPublicBaseUrl}/webhooks/payflex`,
    webhookSecret: requireEnv(process.env.PAYFLEX_WEBHOOK_SECRET ?? 'payflex_dev_secret', 'PAYFLEX_WEBHOOK_SECRET')
  },
  stitch: {
    baseUrl: process.env.STITCH_BASE_URL ?? 'https://sandbox.stitch.money',
    apiKey: process.env.STITCH_API_KEY ?? '',
    webhookSecret: requireEnv(process.env.STITCH_WEBHOOK_SECRET ?? 'stitch_dev_secret', 'STITCH_WEBHOOK_SECRET')
  },
  peach: {
    checkoutBaseUrl: process.env.PEACH_CHECKOUT_BASE_URL ?? 'https://testsecure.peachpayments.com',
    paymentsApiBaseUrl: process.env.PEACH_PAYMENTS_API_BASE_URL ?? 'https://testapi-v2.peachpayments.com',
    cardApiBaseUrl: process.env.PEACH_CARD_API_BASE_URL ?? 'https://sandbox-card.peachpayments.com',
    entityId: process.env.PEACH_ENTITY_ID ?? '',
    secretToken: process.env.PEACH_SECRET_TOKEN ?? '',
    paymentsApiUserId: process.env.PEACH_PAYMENTS_API_USER_ID ?? '',
    paymentsApiPassword: process.env.PEACH_PAYMENTS_API_PASSWORD ?? '',
    paymentsApiEntityId: process.env.PEACH_PAYMENTS_API_ENTITY_ID ?? '',
    cardApiBearerToken: process.env.PEACH_CARD_API_BEARER_TOKEN ?? '',
    cardApiEntityId: process.env.PEACH_CARD_API_ENTITY_ID ?? '',
    defaultShopperResultUrl: process.env.PEACH_SHOPPER_RESULT_URL ?? `${defaultPublicBaseUrl}/peach/return`,
    defaultNotificationUrl: process.env.PEACH_NOTIFICATION_URL ?? `${defaultPublicBaseUrl}/webhooks/peach`,
    webhookSecret: requireEnv(process.env.PEACH_WEBHOOK_SECRET ?? 'peach_dev_secret', 'PEACH_WEBHOOK_SECRET')
  }
};
