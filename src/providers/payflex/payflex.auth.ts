import { env } from '../../config/env';
import { requestWithRetry } from '../../infrastructure/http.client';
import { PayFlexRuntimeConfig } from '../provider-runtime-config';

type PayFlexTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

const isPlaceholder = (value: string): boolean => value.startsWith('payflex_') || value.includes('sandbox.payflex.example');

const getCacheKey = (config: Pick<PayFlexRuntimeConfig, 'authUrl' | 'audience' | 'clientId'>): string =>
  `${config.authUrl}|${config.audience}|${config.clientId}`;

const assertPayFlexAuthConfig = (config: Pick<PayFlexRuntimeConfig, 'authUrl' | 'audience' | 'clientId' | 'clientSecret'>): void => {
  const missing: string[] = [];

  if (!config.authUrl || isPlaceholder(config.authUrl)) {
    missing.push('PAYFLEX_AUTH_URL');
  }

  if (!config.audience || isPlaceholder(config.audience)) {
    missing.push('PAYFLEX_AUDIENCE');
  }

  if (!config.clientId || isPlaceholder(config.clientId)) {
    missing.push('PAYFLEX_CLIENT_ID');
  }

  if (!config.clientSecret || isPlaceholder(config.clientSecret)) {
    missing.push('PAYFLEX_CLIENT_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(
      `Payflex authentication is not fully configured. Set real values for: ${missing.join(', ')}. According to the Payflex docs, client ID and client secret are provided by the Payflex Integrations Team.`
    );
  }
};

export const clearPayFlexTokenCache = (): void => {
  tokenCache.clear();
};

export const getPayFlexAccessToken = async (
  config: Pick<PayFlexRuntimeConfig, 'authUrl' | 'audience' | 'clientId' | 'clientSecret'> = {
    authUrl: env.payflex.authUrl,
    audience: env.payflex.audience,
    clientId: env.payflex.clientId,
    clientSecret: env.payflex.clientSecret
  }
): Promise<string> => {
  assertPayFlexAuthConfig(config);

  const cacheKey = getCacheKey(config);
  const cachedToken = tokenCache.get(cacheKey);

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const response = await requestWithRetry<PayFlexTokenResponse>({
    method: 'POST',
    url: config.authUrl,
    headers: {
      'Content-Type': 'application/json'
    },
    data: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.audience,
      grant_type: 'client_credentials'
    },
    responseType: 'json'
  });

  tokenCache.set(cacheKey, {
    accessToken: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1000
  });

  return response.access_token;
};