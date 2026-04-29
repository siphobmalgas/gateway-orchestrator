import { PaymentProviderName } from '../../domain/enums';

export interface PayUCredentials {
  username: string;
  password: string;
  safekey: string;
  baseUrl?: string;
  redirectBaseUrl?: string;
  defaultNotificationUrl?: string;
  webhookSecret?: string;
}

export interface PayFlexCredentials {
  clientId: string;
  clientSecret: string;
  authUrl?: string;
  audience?: string;
  baseUrl?: string;
  apiKey?: string;
  webhookSecret?: string;
}

export interface ApiKeyCredentials {
  apiKey: string;
  baseUrl?: string;
  webhookSecret?: string;
}

export interface ProviderCredential {
  provider: PaymentProviderName;
  merchantIdentifier: string;
  merchantName: string;
  payuCredentials?: PayUCredentials;
  payflexCredentials?: PayFlexCredentials;
  payfastCredentials?: ApiKeyCredentials;
  stitchCredentials?: ApiKeyCredentials;
  peachCredentials?: ApiKeyCredentials;
  baseUrl?: string;
  redirectBaseUrl?: string;
  apiKey?: string;
  safekey?: string;
  soapUsername?: string;
  soapPassword?: string;
  webhookSecret?: string;
  metadata?: Record<string, unknown>;
  updatedAt: Date;
}

export interface RoutingRule {
  id: string;
  merchantIdentifier: string;
  routeToProvider: PaymentProviderName;
  priority: number;
  paymentMethod?: string;
  currency?: string;
  country?: string;
  enabled: boolean;
  weight?: number;
  metadata?: Record<string, unknown>;
  updatedAt: Date;
}

export interface ProviderConfigRepository {
  upsertCredential(credential: ProviderCredential): Promise<void>;
  getCredential(merchantIdentifier: string, provider: PaymentProviderName): Promise<ProviderCredential | null>;
  listCredentialsByMerchant(merchantIdentifier: string): Promise<ProviderCredential[]>;
  upsertRoutingRule(rule: RoutingRule): Promise<void>;
  listRoutingRules(merchantIdentifier?: string): Promise<RoutingRule[]>;
}
