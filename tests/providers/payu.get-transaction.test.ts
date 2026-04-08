import { env } from '../../src/config/env';
import { PaymentStatus } from '../../src/domain/enums';
import { requestWithRetry } from '../../src/infrastructure/http.client';
import { getTransaction, mapTransactionState } from '../../src/providers/payu/payu.get-transaction';

jest.mock('../../src/infrastructure/http.client', () => ({
  requestWithRetry: jest.fn()
}));

const mockedRequestWithRetry = requestWithRetry as jest.MockedFunction<typeof requestWithRetry>;

describe('mapTransactionState', () => {
  it('maps successful reserve transactions to AUTHORIZED', () => {
    expect(mapTransactionState('SUCCESSFUL', 'RESERVE')).toBe(PaymentStatus.AUTHORIZED);
  });

  it('maps successful reserve cancellations to VOIDED', () => {
    expect(mapTransactionState('SUCCESSFUL', 'RESERVE_CANCEL')).toBe(PaymentStatus.VOIDED);
  });

  it('maps 3DS pending lookups to PENDING_3DS', () => {
    expect(mapTransactionState('3DS_PENDING', 'PAYMENT')).toBe(PaymentStatus.PENDING_3DS);
  });

  it('maps unknown PayU states to UNKNOWN', () => {
    expect(mapTransactionState('UNRECOGNIZED_STATE', 'PAYMENT')).toBe(PaymentStatus.UNKNOWN);
  });
});

describe('getTransaction', () => {
  const originalNodeEnv = env.nodeEnv;

  beforeEach(() => {
    env.nodeEnv = 'development';
    mockedRequestWithRetry.mockReset();
  });

  afterAll(() => {
    env.nodeEnv = originalNodeEnv;
  });

  it('uses the documented getTransaction payload with only payUReference in AdditionalInformation', async () => {
    mockedRequestWithRetry.mockResolvedValue(`
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <ns2:getTransactionResponse xmlns:ns2="http://soap.api.controller.web.payjar.com/">
            <return>
              <merchantReference>payment_123</merchantReference>
              <payUReference>payu_ref_123</payUReference>
              <resultCode>00</resultCode>
              <resultMessage>Successful</resultMessage>
              <successful>true</successful>
              <transactionState>SUCCESSFUL</transactionState>
              <transactionType>RESERVE</transactionType>
            </return>
          </ns2:getTransactionResponse>
        </soap:Body>
      </soap:Envelope>
    `);

    const result = await getTransaction({
      baseUrl: 'https://staging.payu.example/service/PayUAPI',
      payuReference: 'payu_ref_123',
      merchantReference: 'payment_123'
    });

    expect(result.status).toBe(PaymentStatus.AUTHORIZED);
    expect(mockedRequestWithRetry).toHaveBeenCalledTimes(1);

    const requestConfig = mockedRequestWithRetry.mock.calls[0]?.[0];
    expect(requestConfig?.data).toContain('<AdditionalInformation>');
    expect(requestConfig?.data).toContain('<payUReference>payu_ref_123</payUReference>');
    expect(requestConfig?.data).not.toContain('<merchantReference>payment_123</merchantReference>');
  });

  it('prefers currentPayUReference when getTransaction returns the latest operation reference', async () => {
    mockedRequestWithRetry.mockResolvedValue(`
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <ns2:getTransactionResponse xmlns:ns2="http://soap.api.controller.web.payjar.com/">
            <return>
              <merchantReference>payment_123</merchantReference>
              <payUReference>payu_ref_123</payUReference>
              <currentPayUReference>payu_ref_456</currentPayUReference>
              <resultCode>00</resultCode>
              <resultMessage>Successful</resultMessage>
              <successful>true</successful>
              <transactionState>SUCCESSFUL</transactionState>
              <transactionType>FINALIZE</transactionType>
            </return>
          </ns2:getTransactionResponse>
        </soap:Body>
      </soap:Envelope>
    `);

    const result = await getTransaction({
      baseUrl: 'https://staging.payu.example/service/PayUAPI',
      payuReference: 'payu_ref_123',
      merchantReference: 'payment_123'
    });

    expect(result.payuReference).toBe('payu_ref_456');
    expect((result.rawResponse as { currentPayUReference?: string }).currentPayUReference).toBe('payu_ref_456');
  });
});