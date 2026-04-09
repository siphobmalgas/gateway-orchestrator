import { env } from '../../config/env';
import { requestWithRetry } from '../../infrastructure/http.client';

type PayFlexTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

const isPlaceholder = (value: string): boolean => value.startsWith('payflex_') || value.includes('sandbox.payflex.example');

const assertPayFlexAuthConfig = (): void => {
  const missing: string[] = [];

  if (!env.payflex.authUrl || isPlaceholder(env.payflex.authUrl)) {
    missing.push('PAYFLEX_AUTH_URL');
  }

  if (!env.payflex.audience || isPlaceholder(env.payflex.audience)) {
    missing.push('PAYFLEX_AUDIENCE');
  }

  if (!env.payflex.clientId || isPlaceholder(env.payflex.clientId)) {
    missing.push('PAYFLEX_CLIENT_ID');
  }

  if (!env.payflex.clientSecret || isPlaceholder(env.payflex.clientSecret)) {
    missing.push('PAYFLEX_CLIENT_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(
      `Payflex authentication is not fully configured. Set real values for: ${missing.join(', ')}. According to the Payflex docs, client ID and client secret are provided by the Payflex Integrations Team.`
    );
  }
};

export const clearPayFlexTokenCache = (): void => {
  tokenCache = null;
};

export const getPayFlexAccessToken = async (): Promise<string> => {
  assertPayFlexAuthConfig();

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const response = await requestWithRetry<PayFlexTokenResponse>({
    method: 'POST',
    url: env.payflex.authUrl,
    headers: {
      'Content-Type': 'application/json'
    },
    data: {
      client_id: env.payflex.clientId,
      client_secret: env.payflex.clientSecret,
      audience: env.payflex.audience,
      grant_type: 'client_credentials'
    },
    responseType: 'json'
  });

  tokenCache = {
    accessToken: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1000
  };

  return response.access_token;
};