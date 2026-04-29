import { PaymentStatus } from '../../src/domain/enums';
import { PeachProvider } from '../../src/providers/peach/peach.provider';

jest.mock('../../src/infrastructure/http.client', () => ({
  requestWithRetry: jest.fn()
}));

import { requestWithRetry } from '../../src/infrastructure/http.client';

const mockRequestWithRetry = requestWithRetry as jest.MockedFunction<typeof requestWithRetry>;

describe('PeachProvider S2S 3DS Card Flow', () => {
  let provider: PeachProvider;

  beforeEach(() => {
    provider = new PeachProvider();
    mockRequestWithRetry.mockReset();
  });

  const cardMetadata = {
    'card.number': '4111111111111111',
    'card.holder': 'Jane Jones',
    'card.expiryMonth': '05',
    'card.expiryYear': '2034',
    'card.cvv': '123'
  };

  describe('payment with S2S card details', () => {
    it('routes to S2S flow when card details are in metadata', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'peach_s2s_pay_001',
        paymentType: 'DB',
        paymentBrand: 'VISA',
        amount: '100.00',
        currency: 'ZAR',
        result: { code: '000.100.110', description: 'Request successfully processed' }
      });

      const result = await provider.payment({
        paymentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        amount: 100,
        currency: 'ZAR',
        paymentMethod: 'VISA',
        metadata: cardMetadata
      });

      expect(result.provider).toBe('PEACH');
      expect(result.status).toBe(PaymentStatus.CAPTURED);
      expect(result.providerReference).toBe('peach_s2s_pay_001');

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('/v1/payments');
      expect((callArgs.url as string)).not.toContain('/checkout');
      expect((callArgs.data as string)).toContain('card.number=4111111111111111');
      expect((callArgs.data as string)).toContain('paymentType=DB');
      expect((callArgs.data as string)).toContain('paymentBrand=VISA');
    });

    it('returns PENDING_3DS with redirect URL for 3DS challenge', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'peach_s2s_3ds_001',
        paymentType: 'DB',
        paymentBrand: 'VISA',
        amount: '100.00',
        currency: 'ZAR',
        result: { code: '000.200.000', description: 'transaction pending' },
        redirect: {
          url: 'https://3ds-challenge.example.com/authenticate',
          method: 'POST',
          parameters: [
            { name: 'PaReq', value: 'encoded-pareq-data' },
            { name: 'TermUrl', value: 'https://merchant.example.com/peach/return' }
          ]
        }
      });

      const result = await provider.payment({
        paymentId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        amount: 100,
        currency: 'ZAR',
        paymentMethod: 'VISA',
        metadata: cardMetadata
      });

      expect(result.status).toBe(PaymentStatus.PENDING_3DS);
      expect(result.redirectUrl).toBe('https://3ds-challenge.example.com/authenticate');
      expect(result.providerReference).toBe('peach_s2s_3ds_001');

      const rawResponse = result.rawResponse as Record<string, unknown>;
      expect(rawResponse.flowType).toBe('SERVER_TO_SERVER');
    });

    it('falls back to Hosted Checkout when no card details are provided', async () => {
      mockRequestWithRetry.mockResolvedValue({ id: 'checkout_fallback' });

      const result = await provider.payment({
        paymentId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        amount: 250,
        currency: 'ZAR',
        paymentMethod: 'VISA'
      });

      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(result.redirectUrl).toContain('checkoutId=checkout_fallback');

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('/checkout');
    });

    it('falls back to Hosted Checkout for non-card brands even with card metadata', async () => {
      mockRequestWithRetry.mockResolvedValue({ id: 'checkout_eft' });

      const result = await provider.payment({
        paymentId: 'd4e5f6a7-b8c9-0123-def0-123456789ABC',
        amount: 300,
        currency: 'ZAR',
        paymentMethod: 'PEACHEFT',
        metadata: cardMetadata
      });

      expect(result.status).toBe(PaymentStatus.PENDING);
      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('/checkout');
    });
  });

  describe('authorize with S2S card details', () => {
    it('uses PA payment type for S2S card authorize', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'peach_s2s_auth_001',
        paymentType: 'PA',
        paymentBrand: 'VISA',
        amount: '500.00',
        currency: 'ZAR',
        result: { code: '000.100.110', description: 'Request successfully processed' }
      });

      const result = await provider.authorize({
        paymentId: 'e5f6a7b8-c9d0-1234-ef01-23456789ABCD',
        amount: 500,
        currency: 'ZAR',
        paymentMethod: 'VISA',
        metadata: cardMetadata
      });

      expect(result.status).toBe(PaymentStatus.AUTHORIZED);
      expect(result.providerReference).toBe('peach_s2s_auth_001');

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('/v1/payments');
      expect((callArgs.data as string)).toContain('paymentType=PA');
    });

    it('returns PENDING_3DS for authorize with 3DS challenge', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'peach_s2s_auth_3ds',
        paymentType: 'PA',
        paymentBrand: 'MASTER',
        result: { code: '000.200.000', description: 'transaction pending' },
        redirect: {
          url: 'https://3ds.example.com/challenge',
          method: 'POST',
          parameters: [{ name: 'creq', value: 'challenge-request-data' }]
        }
      });

      const result = await provider.authorize({
        paymentId: 'f6a7b8c9-d0e1-2345-f012-3456789ABCDE',
        amount: 750,
        currency: 'ZAR',
        paymentMethod: 'MASTER',
        metadata: cardMetadata
      });

      expect(result.status).toBe(PaymentStatus.PENDING_3DS);
      expect(result.redirectUrl).toBe('https://3ds.example.com/challenge');
    });
  });

  describe('S2S 3DS parameters', () => {
    it('includes 3DS browser data when provided', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'peach_s2s_browser',
        result: { code: '000.100.110', description: 'success' }
      });

      await provider.payment({
        paymentId: 'a7b8c9d0-e1f2-3456-0123-456789ABCDEF',
        amount: 200,
        currency: 'ZAR',
        paymentMethod: 'VISA',
        metadata: {
          ...cardMetadata,
          'customer.browser.acceptHeader': 'text/html',
          'customer.browser.language': 'en-US',
          'customer.browser.screenHeight': '1080',
          'customer.browser.screenWidth': '1920',
          'customer.browser.timezone': '-120',
          'customer.browser.userAgent': 'Mozilla/5.0',
          'customer.browser.javaEnabled': 'false',
          'customer.browser.javascriptEnabled': 'true',
          'customer.ip': '192.168.1.1'
        }
      });

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      const data = callArgs.data as string;
      expect(data).toContain('customer.browser.acceptHeader=text%2Fhtml');
      expect(data).toContain('customer.browser.language=en-US');
      expect(data).toContain('customer.browser.screenHeight=1080');
      expect(data).toContain('customer.browser.screenWidth=1920');
      expect(data).toContain('customer.browser.timezone=-120');
      expect(data).toContain('customer.ip=192.168.1.1');
    });

    it('includes threeDSecure challenge indicator when provided', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'peach_s2s_challenge',
        result: { code: '000.100.110', description: 'success' }
      });

      await provider.payment({
        paymentId: 'b8c9d0e1-f234-5678-1234-56789ABCDEF0',
        amount: 150,
        currency: 'ZAR',
        paymentMethod: 'VISA',
        metadata: {
          ...cardMetadata,
          'threeDSecure.challengeIndicator': '04',
          'threeDSecure.exemptionFlag': '03'
        }
      });

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      const data = callArgs.data as string;
      expect(data).toContain('threeDSecure.challengeIndicator=04');
      expect(data).toContain('threeDSecure.exemptionFlag=03');
    });

    it('includes custom parameters in S2S request', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'peach_s2s_custom',
        result: { code: '000.100.110', description: 'success' }
      });

      await provider.payment({
        paymentId: 'c9d0e1f2-3456-7890-2345-6789ABCDEF01',
        amount: 100,
        currency: 'ZAR',
        paymentMethod: 'VISA',
        metadata: {
          ...cardMetadata,
          'customParameters[3DS2_enrolled]': 'true',
          'customParameters[3DS2_flow]': 'challenge'
        }
      });

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      const data = callArgs.data as string;
      expect(data).toContain('customParameters%5B3DS2_enrolled%5D=true');
      expect(data).toContain('customParameters%5B3DS2_flow%5D=challenge');
    });
  });

  describe('lookupTransaction for S2S payments', () => {
    it('uses S2S status endpoint for long provider references', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: '8ac7a4a29d21e3c1019d26a8952111ac',
        paymentType: 'PA',
        paymentBrand: 'VISA',
        amount: '92.00',
        currency: 'EUR',
        merchantTransactionId: 'a1b2c3d4e5f67890',
        result: { code: '000.100.110', description: 'success' }
      });

      const result = await provider.lookupTransaction({
        providerReference: '8ac7a4a29d21e3c1019d26a8952111ac'
      });

      expect(result.status).toBe(PaymentStatus.AUTHORIZED);
      expect(result.providerReference).toBe('8ac7a4a29d21e3c1019d26a8952111ac');
      expect(result.merchantReference).toBe('a1b2c3d4e5f67890');
      expect(result.amountInCents).toBe(9200);
      expect(result.currency).toBe('EUR');

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('/v1/payments/8ac7a4a29d21e3c1019d26a8952111ac');
    });

    it('uses Checkout status for short references', async () => {
      mockRequestWithRetry.mockResolvedValue({
        merchantTransactionId: 'a1b2c3d4e5f67890',
        result: { code: '000.000.000', description: 'success' },
        payments: [{ paymentType: 'DB', result: { code: '000.000.000' } }]
      });

      await provider.lookupTransaction({
        merchantReference: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      });

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('/status');
    });
  });
});
