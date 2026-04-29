import { env } from '../config/env';
import { PaymentProviderName } from '../domain/enums';
import { PaymentProvider } from '../domain/provider.interface';
import { PayFastProvider } from '../providers/payfast/payfast.provider';
import { PayFlexProvider } from '../providers/payflex/payflex.provider';
import { PayUProvider } from '../providers/payu/payu.provider';
import { PeachProvider } from '../providers/peach/peach.provider';
import { ApiKeyProviderRuntimeConfig, PayFlexRuntimeConfig, PayURuntimeConfig } from '../providers/provider-runtime-config';
import { StitchProvider } from '../providers/stitch/stitch.provider';
import { ProviderCredential } from './repositories/provider-config.repository';

export type PaymentProviderFactory = (credential?: ProviderCredential | null) => PaymentProvider;

const resolvePayUConfig = (credential?: ProviderCredential | null): PayURuntimeConfig => ({
  baseUrl: credential?.payuCredentials?.baseUrl ?? credential?.baseUrl ?? env.payu.baseUrl,
  webhookSecret: credential?.payuCredentials?.webhookSecret ?? credential?.webhookSecret ?? env.payu.webhookSecret,
  soapUsername: credential?.payuCredentials?.username ?? credential?.soapUsername ?? env.payu.soapUsername,
  soapPassword: credential?.payuCredentials?.password ?? credential?.soapPassword ?? env.payu.soapPassword,
  safekey: credential?.payuCredentials?.safekey ?? credential?.safekey ?? env.payu.safekey,
  rppRedirectBaseUrl: credential?.payuCredentials?.redirectBaseUrl ?? credential?.redirectBaseUrl ?? env.payu.rppRedirectBaseUrl,
  defaultReturnUrl: credential?.payuCredentials?.defaultReturnUrl ?? env.payu.defaultReturnUrl,
  defaultCancelUrl: credential?.payuCredentials?.defaultCancelUrl ?? env.payu.defaultCancelUrl,
  defaultNotificationUrl: credential?.payuCredentials?.defaultNotificationUrl ?? env.payu.defaultNotificationUrl
});

const resolvePayFlexConfig = (credential?: ProviderCredential | null): PayFlexRuntimeConfig => ({
  baseUrl: credential?.payflexCredentials?.baseUrl ?? credential?.baseUrl ?? env.payflex.baseUrl,
  apiKey: credential?.payflexCredentials?.apiKey ?? credential?.apiKey ?? env.payflex.apiKey,
  webhookSecret: credential?.payflexCredentials?.webhookSecret ?? credential?.webhookSecret ?? env.payflex.webhookSecret,
  authUrl: credential?.payflexCredentials?.authUrl ?? env.payflex.authUrl,
  audience: credential?.payflexCredentials?.audience ?? env.payflex.audience,
  clientId: credential?.payflexCredentials?.clientId ?? env.payflex.clientId,
  clientSecret: credential?.payflexCredentials?.clientSecret ?? env.payflex.clientSecret
});

const resolveApiKeyProviderConfig = (
  provider: PaymentProviderName.PAYFAST | PaymentProviderName.STITCH | PaymentProviderName.PEACH,
  credential?: ProviderCredential | null
): ApiKeyProviderRuntimeConfig => {
  const scopedCredentials =
    provider === PaymentProviderName.PAYFAST
      ? credential?.payfastCredentials
      : provider === PaymentProviderName.STITCH
        ? credential?.stitchCredentials
        : credential?.peachCredentials;

  const envConfig =
    provider === PaymentProviderName.PAYFAST
      ? env.payfast
      : provider === PaymentProviderName.STITCH
        ? env.stitch
        : env.peach;

  return {
    baseUrl: scopedCredentials?.baseUrl ?? credential?.baseUrl ?? envConfig.baseUrl,
    apiKey: scopedCredentials?.apiKey ?? credential?.apiKey ?? envConfig.apiKey,
    webhookSecret: scopedCredentials?.webhookSecret ?? credential?.webhookSecret ?? envConfig.webhookSecret
  };
};

export const createProviderRegistry = (): Record<PaymentProviderName, PaymentProviderFactory> => ({
  [PaymentProviderName.PAYU]: (credential) => new PayUProvider(resolvePayUConfig(credential)),
  [PaymentProviderName.PAYFAST]: (credential) => new PayFastProvider(resolveApiKeyProviderConfig(PaymentProviderName.PAYFAST, credential)),
  [PaymentProviderName.PAYFLEX]: (credential) => new PayFlexProvider(resolvePayFlexConfig(credential)),
  [PaymentProviderName.STITCH]: (credential) => new StitchProvider(resolveApiKeyProviderConfig(PaymentProviderName.STITCH, credential)),
  [PaymentProviderName.PEACH]: (credential) => new PeachProvider(resolveApiKeyProviderConfig(PaymentProviderName.PEACH, credential))
});