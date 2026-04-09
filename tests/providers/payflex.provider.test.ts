import { env } from '../../src/config/env';
import { PaymentStatus } from '../../src/domain/enums';
import { requestWithRetry } from '../../src/infrastructure/http.client';
import { clearPayFlexTokenCache } from '../../src/providers/payflex/payflex.auth';
import { PayFlexProvider } from '../../src/providers/payflex/payflex.provider';

jest.mock('../../src/infrastructure/http.client', () => ({
  requestWithRetry: jest.fn()
}));

const mockedRequestWithRetry = requestWithRetry as jest.MockedFunction<typeof requestWithRetry>;

describe('PayFlexProvider', () => {
  const provider = new PayFlexProvider();
  const originalNodeEnv = env.nodeEnv;
  const originalAuthUrl = env.payflex.authUrl;
  const originalAudience = env.payflex.audience;
  const originalClientId = env.payflex.clientId;
  const originalClientSecret = env.payflex.clientSecret;

  beforeEach(() => {
    clearPayFlexTokenCache();
    mockedRequestWithRetry.mockReset();
    env.nodeEnv = 'development';
    env.payflex.baseUrl = 'https://api.uat.payflex.co.za';
    env.payflex.authUrl = 'https://auth-uat.payflex.co.za/auth/merchant';
    env.payflex.audience = 'https://auth-dev.payflex.co.za';
    env.payflex.clientId = 'test-client-id';
    env.payflex.clientSecret = 'test-client-secret';
  });

  afterAll(() => {
    env.nodeEnv = originalNodeEnv;
    env.payflex.authUrl = originalAuthUrl;
    env.payflex.audience = originalAudience;
    env.payflex.clientId = originalClientId;
    env.payflex.clientSecret = originalClientSecret;
  });

  it('creates a redirect order and returns pending payment', async () => {
    mockedRequestWithRetry
      .mockResolvedValueOnce({ access_token: 'token-1', expires_in: 3600, token_type: 'Bearer' })
      .mockResolvedValueOnce({
        token: 'checkout-token',
        expiryDateTime: '2026-01-01T00:00:00Z',
        redirectUrl: 'https://checkout.payflex.co.za/checkout?token=checkout-token',
        orderId: '8eb068f0-1111-2222-3333-444444444444'
      });

    const result = await provider.payment({
      paymentId: 'payment_1',
      amount: 105,
      currency: 'ZAR',
      redirectContext: {
        returnUrl: 'https://merchant.example.com/payflex/confirm',
        cancelUrl: 'https://merchant.example.com/payflex/cancel',
        notificationUrl: 'https://merchant.example.com/webhooks/payflex'
      },
      metadata: {
        firstName: 'Sipho',
        lastName: 'Mthembu',
        email: 'payflextest+1@gmail.com',
        mobile: '0123456789'
      }
    });

    expect(result.status).toBe(PaymentStatus.PENDING);
    expect(result.providerReference).toBe('8eb068f0-1111-2222-3333-444444444444');
    expect(result.redirectUrl).toContain('checkout.payflex.co.za');
  });

  it('rejects payment requests without mandatory customer metadata', async () => {
    await expect(
      provider.payment({
        paymentId: 'payment_missing_fields',
        amount: 105,
        currency: 'ZAR',
        metadata: {
          email: 'payflextest+missing@gmail.com'
        }
      })
    ).rejects.toThrow('PAYFLEX requires metadata fields:');

    expect(mockedRequestWithRetry).not.toHaveBeenCalled();
  });

  it('caches the oauth token across multiple calls', async () => {
    mockedRequestWithRetry
      .mockResolvedValueOnce({ access_token: 'token-1', expires_in: 3600, token_type: 'Bearer' })
      .mockResolvedValueOnce({
        token: 'checkout-token-1',
        expiryDateTime: '2026-01-01T00:00:00Z',
        redirectUrl: 'https://checkout.payflex.co.za/checkout?token=1',
        orderId: 'order-1'
      })
      .mockResolvedValueOnce({
        orderId: 'order-2',
        orderStatus: 'Approved',
        amount: 100,
        merchantReference: 'payment_2'
      });

    await provider.payment({
      paymentId: 'payment_1',
      amount: 100,
      currency: 'ZAR',
      metadata: {
        firstName: 'Sipho',
        lastName: 'Mthembu',
        email: 'payflextest+cache@gmail.com',
        mobile: '0123456789'
      }
    });
    await provider.lookupTransaction({ payuReference: 'order-2', providerReference: 'order-2', merchantReference: 'payment_2' });

    expect(mockedRequestWithRetry).toHaveBeenCalledTimes(3);
  });

  it('maps approved order lookups to captured', async () => {
    mockedRequestWithRetry
      .mockResolvedValueOnce({ access_token: 'token-1', expires_in: 3600, token_type: 'Bearer' })
      .mockResolvedValueOnce({
        orderId: 'order-1',
        orderStatus: 'Approved',
        amount: 105,
        merchantReference: 'payment_1'
      });

    const result = await provider.lookupTransaction({ payuReference: 'order-1', providerReference: 'order-1', merchantReference: 'payment_1' });

    expect(result.status).toBe(PaymentStatus.CAPTURED);
    expect(result.providerReference).toBe('order-1');
    expect(result.transactionState).toBe('Approved');
  });

  it('supports refunds using orderId', async () => {
    mockedRequestWithRetry
      .mockResolvedValueOnce({ access_token: 'token-1', expires_in: 3600, token_type: 'Bearer' })
      .mockResolvedValueOnce({
        refundId: 'refund-1',
        refundedDateTime: '2026-01-01T00:00:00Z',
        merchantReference: 'payment_1',
        amount: 10
      });

    const result = await provider.refund({
      transactionId: 'order-1',
      amount: 10,
      currency: 'ZAR',
      merchantReference: 'payment_1'
    });

    expect(result.status).toBe(PaymentStatus.REFUNDED);
    expect(result.providerReference).toBe('order-1');
  });

  it('treats unsigned callbacks as valid and maps approved webhooks', async () => {
    expect(provider.verifyWebhookSignature('{}', '')).toBe(true);

    const event = await provider.handleWebhook(JSON.stringify({
      orderId: 'order-1',
      orderStatus: 'Approved',
      merchantReference: 'payment_1',
      amount: 105
    }));

    expect(event).toMatchObject({
      merchantReference: 'payment_1',
      providerReference: 'order-1',
      status: PaymentStatus.CAPTURED
    });
  });

  it('rejects unsupported capture and void operations', async () => {
    await expect(provider.capture({ transactionId: 'order-1', amount: 0, currency: 'ZAR' })).rejects.toThrow(
      'PAYFLEX capture is not supported by the documented integration'
    );
    await expect(provider.void({ transactionId: 'order-1', amount: 0, currency: 'ZAR' })).rejects.toThrow(
      'PAYFLEX void is not supported by the documented integration'
    );
  });
});