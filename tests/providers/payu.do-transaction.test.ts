import { env } from '../../src/config/env';
import { PaymentStatus } from '../../src/domain/enums';
import { requestWithRetry } from '../../src/infrastructure/http.client';
import { runFinalizeDoTransaction, runReserveDoTransaction } from '../../src/providers/payu/payu.do-transaction';

jest.mock('../../src/infrastructure/http.client', () => ({
  requestWithRetry: jest.fn()
}));

const mockedRequestWithRetry = requestWithRetry as jest.MockedFunction<typeof requestWithRetry>;

const baseInput = {
  baseUrl: 'https://staging.payu.example/service/PayUAPI',
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