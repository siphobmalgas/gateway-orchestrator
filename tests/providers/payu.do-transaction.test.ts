import { env } from '../../src/config/env';
import { PaymentStatus } from '../../src/domain/enums';
import { requestWithRetry } from '../../src/infrastructure/http.client';
import { runFinalizeDoTransaction, runReserveDoTransaction } from '../../src/providers/payu/payu.do-transaction';

jest.mock('../../src/infrastructure/http.client', () => ({
  requestWithRetry: jest.fn()
}));

const mockedRequestWithRetry = requestWithRetry as jest.MockedFunction<typeof requestWithRetry>;

const payuConfig = {
  baseUrl: 'https://staging.payu.example/service/PayUAPI',
  webhookSecret: 'payu-test-secret',
  soapUsername: '200021',
  soapPassword: 'WSAUFbw6',
  safekey: '{07F70723-1B96-4B97-B891-7BF708594EEA}',
  rppRedirectBaseUrl: 'https://staging.payu.example/rpp.do',
  defaultReturnUrl: 'https://merchant.example.com/payu/return',
  defaultCancelUrl: 'https://merchant.example.com/payu/cancel',
  defaultNotificationUrl: 'https://merchant.example.com/webhooks/payu'
};

const baseInput = {
  config: payuConfig,
  transactionId: 'payu_ref_123',
  amount: 100,
  currency: 'ZAR',
  merchantReference: 'payment_123'
};

describe('PayU doTransaction status resolution', () => {
  const originalNodeEnv = env.nodeEnv;

  beforeEach(() => {
    env.nodeEnv = 'development';
    mockedRequestWithRetry.mockReset();
  });

  afterAll(() => {
    env.nodeEnv = originalNodeEnv;
  });

  it('uses transactionState instead of treating resultCode 00 as terminal capture success', async () => {
    mockedRequestWithRetry.mockResolvedValue(`
      <soapResponse>
        <successful>true</successful>
        <resultCode>00</resultCode>
        <transactionState>PROCESSING</transactionState>
        <transactionType>FINALIZE</transactionType>
        <payUReference>payu_ref_123</payUReference>
      </soapResponse>
    `);

    const result = await runFinalizeDoTransaction(baseInput);

    expect(result.status).toBe(PaymentStatus.PENDING);
  });

  it('maps reserve success from SUCCESSFUL plus RESERVE to AUTHORIZED', async () => {
    mockedRequestWithRetry.mockResolvedValue(`
      <soapResponse>
        <successful>true</successful>
        <resultCode>00</resultCode>
        <transactionState>SUCCESSFUL</transactionState>
        <transactionType>RESERVE</transactionType>
        <payUReference>payu_ref_123</payUReference>
      </soapResponse>
    `);

    const result = await runReserveDoTransaction({
      ...baseInput,
      creditCard: {
        cardNumber: '4111111111111111',
        cardExpiry: '1228',
        cvv: '123',
        nameOnCard: 'Test User'
      }
    });

    expect(result.status).toBe(PaymentStatus.AUTHORIZED);
  });

  it('maps P3DS responses to PENDING_3DS', async () => {
    mockedRequestWithRetry.mockResolvedValue(`
      <soapResponse>
        <successful>true</successful>
        <resultCode>P3DS</resultCode>
        <transactionState>PROCESSING</transactionState>
        <transactionType>RESERVE</transactionType>
        <secure3DId>abc123</secure3DId>
        <secure3DUrl><![CDATA[https://example.com/3ds]]></secure3DUrl>
        <payUReference>payu_ref_123</payUReference>
      </soapResponse>
    `);

    const result = await runReserveDoTransaction({
      ...baseInput,
      returnUrl: 'https://merchant.example.com/payments/return',
      cancelUrl: 'https://merchant.example.com/payments/cancel',
      creditCard: {
        cardNumber: '4111111111111111',
        cardExpiry: '1228',
        cvv: '123',
        nameOnCard: 'Test User'
      },
      secure3d: true
    });

    expect(result.status).toBe(PaymentStatus.PENDING_3DS);
  });

  it('includes merchant return and cancel urls in secure3d reserve payloads', async () => {
    mockedRequestWithRetry.mockResolvedValue(`
      <soapResponse>
        <successful>true</successful>
        <resultCode>P3DS</resultCode>
        <transactionState>PROCESSING</transactionState>
        <transactionType>RESERVE</transactionType>
        <secure3DId>abc123</secure3DId>
        <secure3DUrl><![CDATA[https://example.com/3ds]]></secure3DUrl>
        <payUReference>payu_ref_123</payUReference>
      </soapResponse>
    `);

    await runReserveDoTransaction({
      ...baseInput,
      returnUrl: 'https://merchant.example.com/payments/return',
      cancelUrl: 'https://merchant.example.com/payments/cancel',
      creditCard: {
        cardNumber: '4111111111111111',
        cardExpiry: '1228',
        cvv: '123',
        nameOnCard: 'Test User'
      },
      secure3d: true
    });

    expect(mockedRequestWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining('<returnUrl>https://merchant.example.com/payments/return</returnUrl>')
      })
    );
    expect(mockedRequestWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining('<cancelUrl>https://merchant.example.com/payments/cancel</cancelUrl>')
      })
    );
  });

  it('rejects secure3d reserve requests without merchant return and cancel urls', async () => {
    await expect(
      runReserveDoTransaction({
        ...baseInput,
        creditCard: {
          cardNumber: '4111111111111111',
          cardExpiry: '1228',
          cvv: '123',
          nameOnCard: 'Test User'
        },
        secure3d: true
      })
    ).rejects.toThrow('redirectContext.returnUrl');

    expect(mockedRequestWithRetry).not.toHaveBeenCalled();
  });

  it('prefers currentPayUReference when PayU returns a new operation reference', async () => {
    mockedRequestWithRetry.mockResolvedValue(`
      <soapResponse>
        <successful>true</successful>
        <resultCode>00</resultCode>
        <transactionType>FINALIZE</transactionType>
        <payUReference>payu_ref_123</payUReference>
        <currentPayUReference>payu_ref_456</currentPayUReference>
      </soapResponse>
    `);

    const result = await runFinalizeDoTransaction(baseInput);

    expect(result.providerReference).toBe('payu_ref_456');
    expect((result.rawResponse as { result: { currentPayuReference?: string; effectivePayuReference: string } }).result.currentPayuReference).toBe('payu_ref_456');
    expect((result.rawResponse as { result: { currentPayuReference?: string; effectivePayuReference: string } }).result.effectivePayuReference).toBe('payu_ref_456');
  });
});