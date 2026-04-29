export interface PayURuntimeConfig {
  baseUrl: string;
  webhookSecret: string;
  soapUsername: string;
  soapPassword: string;
  safekey: string;
  rppRedirectBaseUrl: string;
  defaultNotificationUrl: string;
}

export interface PayFlexRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  authUrl: string;
  audience: string;
  clientId: string;
  clientSecret: string;
}

export interface ApiKeyProviderRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
}