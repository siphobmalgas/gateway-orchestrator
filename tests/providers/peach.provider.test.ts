import { PaymentStatus, PEACH_PAYMENT_BRANDS } from '../../src/domain/enums';
import { PeachProvider } from '../../src/providers/peach/peach.provider';
import { generateMerchantTransactionId } from '../../src/providers/peach/peach.checkout';

jest.mock('../../src/infrastructure/http.client', () => ({
  requestWithRetry: jest.fn()
}));

import { requestWithRetry } from '../../src/infrastructure/http.client';

const mockRequestWithRetry = requestWithRetry as jest.MockedFunction<typeof requestWithRetry>;

describe('PeachProvider', () => {
  let provider: PeachProvider;

  beforeEach(() => {
    provider = new PeachProvider();
    mockRequestWithRetry.mockReset();
  });

  describe('generateMerchantTransactionId', () => {
    it('generates a 16-char hex ID from a UUID', () => {
      const id = generateMerchantTransactionId('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(id).toBe('a1b2c3d4e5f67890');
      expect(id).toHaveLength(16);
    });

    it('is deterministic', () => {
      const uuid = '12345678-1234-1234-1234-123456789012';
      expect(generateMerchantTransactionId(uuid)).toBe(generateMerchantTransactionId(uuid));
    });
  });

  describe('payment', () => {
    it('creates a checkout with DB payment type and returns redirect URL', async () => {
      mockRequestWithRetry.mockResolvedValue({ id: 'checkout_abc123' });

      const result = await provider.payment({
        paymentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        amount: 250,
        currency: 'ZAR'
      });

      expect(result.provider).toBe('PEACH');
      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(result.amount).toBe(250);
      expect(result.currency).toBe('ZAR');
      expect(result.providerReference).toBe('checkout_abc123');
      expect(result.redirectUrl).toContain('checkoutId=checkout_abc123');

      expect(mockRequestWithRetry).toHaveBeenCalledTimes(1);
      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.method).toBe('POST');
      expect((callArgs.url as string)).toContain('/checkout');
      expect((callArgs.data as string)).toContain('paymentType=DB');
    });

    it('includes paymentBrand when specified', async () => {
      mockRequestWithRetry.mockResolvedValue({ id: 'checkout_visa1' });

      await provider.payment({
        paymentId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        amount: 100,
        currency: 'ZAR',
        paymentMethod: 'VISA'
      });

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.data as string)).toContain('paymentBrand=VISA');
    });
  });

  describe('authorize', () => {
    it('uses PA payment type for card brands', async () => {
      mockRequestWithRetry.mockResolvedValue({ id: 'checkout_pa1' });

      const result = await provider.authorize({
        paymentId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        amount: 500,
        currency: 'ZAR',
        paymentMethod: 'VISA'
      });

      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(result.redirectUrl).toContain('checkoutId=checkout_pa1');

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.data as string)).toContain('paymentType=PA');
    });

    it('uses DB payment type for non-card brands', async () => {
      mockRequestWithRetry.mockResolvedValue({ id: 'checkout_db1' });

      await provider.authorize({
        paymentId: 'd4e5f6a7-b8c9-0123-defa-234567890123',
        amount: 300,
        currency: 'ZAR',
        paymentMethod: 'PAYBYBANK'
      });

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.data as string)).toContain('paymentType=DB');
    });

    it.each(['VISA', 'MASTER', 'AMEX', 'DINERS'] as const)('uses PA for card brand %s', async (brand) => {
      mockRequestWithRetry.mockResolvedValue({ id: `checkout_${brand}` });

      await provider.authorize({
        paymentId: 'e5f6a7b8-c9d0-1234-efab-345678901234',
        amount: 100,
        currency: 'ZAR',
        paymentMethod: brand
      });

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.data as string)).toContain('paymentType=PA');
    });
  });

  describe('capture', () => {
    it('calls card management API with CP payment type', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'capture_result_001',
        result: { code: '000.100.110', description: 'Success' }
      });

      const result = await provider.capture({
        transactionId: 'original_txn_id',
        amount: 250,
        currency: 'ZAR'
      });

      expect(result.provider).toBe('PEACH');
      expect(result.status).toBe(PaymentStatus.CAPTURED);
      expect(result.providerReference).toBe('capture_result_001');

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('/v1/payments/original_txn_id');
      expect((callArgs.data as string)).toContain('paymentType=CP');
      expect((callArgs.headers as Record<string, string>).Authorization).toContain('Bearer');
    });

    it('returns FAILED for unsuccessful capture', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'capture_fail_001',
        result: { code: '800.100.100', description: 'Transaction declined' }
      });

      const result = await provider.capture({
        transactionId: 'original_txn_id',
        amount: 250,
        currency: 'ZAR'
      });

      expect(result.status).toBe(PaymentStatus.FAILED);
    });
  });

  describe('refund', () => {
    it('calls Payments API with RF payment type', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'refund_result_001',
        result: { code: '000.100.110', description: 'Success' }
      });

      const result = await provider.refund({
        transactionId: 'original_txn_id',
        amount: 100,
        currency: 'ZAR'
      });

      expect(result.provider).toBe('PEACH');
      expect(result.status).toBe(PaymentStatus.REFUNDED);
      expect(result.providerReference).toBe('refund_result_001');

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('/payments/original_txn_id');
      expect((callArgs.data as string)).toContain('paymentType=RF');
    });
  });

  describe('void', () => {
    it('calls card management API with RV payment type', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'reversal_result_001',
        result: { code: '000.100.110', description: 'Success' }
      });

      const result = await provider.void({
        transactionId: 'original_txn_id',
        amount: 250,
        currency: 'ZAR'
      });

      expect(result.provider).toBe('PEACH');
      expect(result.status).toBe(PaymentStatus.VOIDED);
      expect(result.providerReference).toBe('reversal_result_001');

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('/v1/payments/original_txn_id');
      expect((callArgs.data as string)).toContain('paymentType=RV');
    });
  });

  describe('lookupTransaction', () => {
    it('queries status by merchantTransactionId derived from merchantReference', async () => {
      mockRequestWithRetry.mockResolvedValue({
        id: 'status_txn_001',
        amount: '250.00',
        currency: 'ZAR',
        paymentType: 'DB',
        result: { code: '000.100.110', description: 'Success' }
      });

      const result = await provider.lookupTransaction({
        providerReference: 'checkout_id_123',
        merchantReference: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      });

      expect(result.status).toBe(PaymentStatus.CAPTURED);
      expect(result.providerReference).toBe('status_txn_001');
      expect(result.merchantReference).toBe('a1b2c3d4e5f67890');

      const callArgs = mockRequestWithRetry.mock.calls[0][0] as Record<string, unknown>;
      expect((callArgs.url as string)).toContain('merchantTransactionId=a1b2c3d4e5f67890');
    });
  });

  describe('webhook handling', () => {
    it('verifies a valid checkout webhook signature', () => {
      const { generatePeachSignature } = jest.requireActual('../../src/providers/peach/peach.signature');
      const { env } = jest.requireActual('../../src/config/env');
      const secretToken = env.peach.secretToken;
      const params = { merchantTransactionId: 'test1234test5678', amount: '100.00', currency: 'ZAR' };
      const signature = generatePeachSignature(params, secretToken);
      const formBody = Object.entries({ ...params, signature })
        .map(([k, v]: [string, string]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

      expect(provider.verifyWebhookSignature(formBody, '')).toBe(true);
    });

    it('falls back to header signature verification when signature header is provided', () => {
      const result = provider.verifyWebhookSignature('some_payload', 'invalid_sig');
      expect(result).toBe(false);
    });

    it('parses a webhook and resolves the full payment ID', async () => {
      // First create a payment to populate the mapping
      mockRequestWithRetry.mockResolvedValue({ id: 'checkout_wh1' });
      await provider.payment({
        paymentId: 'f6a7b8c9-d0e1-2345-fabc-456789012345',
        amount: 100,
        currency: 'ZAR'
      });

      const webhookPayload = {
        merchantTransactionId: 'f6a7b8c9d0e12345',
        id: 'peach_payment_result_001',
        paymentType: 'DB',
        result: { code: '000.100.110' }
      };

      const event = await provider.handleWebhook(webhookPayload);

      expect(event).not.toBeNull();
      expect(event!.merchantReference).toBe('f6a7b8c9-d0e1-2345-fabc-456789012345');
      expect(event!.providerReference).toBe('peach_payment_result_001');
      expect(event!.status).toBe(PaymentStatus.CAPTURED);
    });
  });
});
