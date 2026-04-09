import { env } from '../../src/config/env';
import { requestWithRetry } from '../../src/infrastructure/http.client';
import { clearPayFlexTokenCache, getPayFlexAccessToken } from '../../src/providers/payflex/payflex.auth';

jest.mock('../../src/infrastructure/http.client', () => ({
  requestWithRetry: jest.fn()
}));

const mockedRequestWithRetry = requestWithRetry as jest.MockedFunction<typeof requestWithRetry>;

describe('PayFlex auth', () => {
  const originalConfig = {
    authUrl: env.payflex.authUrl,
    audience: env.payflex.audience,
    clientId: env.payflex.clientId,
    clientSecret: env.payflex.clientSecret
  };

  beforeEach(() => {
    clearPayFlexTokenCache();
    mockedRequestWithRetry.mockReset();
    env.payflex.authUrl = originalConfig.authUrl;
    env.payflex.audience = originalConfig.audience;
    env.payflex.clientId = originalConfig.clientId;
    env.payflex.clientSecret = originalConfig.clientSecret;
  });

  afterAll(() => {
    env.payflex.authUrl = originalConfig.authUrl;
    env.payflex.audience = originalConfig.audience;
    env.payflex.clientId = originalConfig.clientId;
    env.payflex.clientSecret = originalConfig.clientSecret;
  });

  it('fails fast when required Payflex auth credentials are still placeholders', async () => {
    env.payflex.clientId = 'payflex_client_id';
    env.payflex.clientSecret = 'payflex_client_secret';

    await expect(getPayFlexAccessToken()).rejects.toThrow(
      'Payflex authentication is not fully configured. Set real values for: PAYFLEX_CLIENT_ID, PAYFLEX_CLIENT_SECRET.'
    );

    expect(mockedRequestWithRetry).not.toHaveBeenCalled();
  });

  it('requests an oauth token when real credentials are configured', async () => {
    env.payflex.authUrl = 'https://auth-uat.payflex.co.za/auth/merchant';
    env.payflex.audience = 'https://auth-dev.payflex.co.za';
    env.payflex.clientId = 'client-id';
    env.payflex.clientSecret = 'client-secret';
    mockedRequestWithRetry.mockResolvedValue({
      access_token: 'access-token',
      expires_in: 3600,
      token_type: 'Bearer'
    });

    await expect(getPayFlexAccessToken()).resolves.toBe('access-token');
    expect(mockedRequestWithRetry).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://auth-uat.payflex.co.za/auth/merchant',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        client_id: 'client-id',
        client_secret: 'client-secret',
        audience: 'https://auth-dev.payflex.co.za',
        grant_type: 'client_credentials'
      },
      responseType: 'json'
    });
  });
});