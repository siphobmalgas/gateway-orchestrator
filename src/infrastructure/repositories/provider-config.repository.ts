export interface PayUCredentials {
  username: string;
  password: string;
  safekey: string;
}

export interface ProviderCredential {
  provider: string;
  merchantIdentifier: string;
  merchantName: string;
  payuCredentials?: PayUCredentials;
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
  provider: string;
  routeToProvider: string;
  priority: number;
  currency?: string;
  country?: string;
  enabled: boolean;
  weight?: number;
  metadata?: Record<string, unknown>;
  updatedAt: Date;
}

export interface ProviderConfigRepository {
  upsertCredential(credential: ProviderCredential): Promise<void>;
  getCredential(provider: string): Promise<ProviderCredential | null>;
  upsertRoutingRule(rule: RoutingRule): Promise<void>;
  listRoutingRules(): Promise<RoutingRule[]>;
}
