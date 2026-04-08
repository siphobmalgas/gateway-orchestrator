import { PayUProvider } from '../../src/providers/payu/payu.provider';
import { PAYU_REDIRECT_PAYMENT_METHODS, PaymentStatus } from '../../src/domain/enums';

describe('PayUProvider', () => {
  it.each(PAYU_REDIRECT_PAYMENT_METHODS)('returns redirect payment response for %s', async (method) => {
    const provider = new PayUProvider();

    const result = await provider.authorize({
      paymentId: 'payment_1',
      amount: 100,
      currency: 'ZAR',
      paymentMethod: method
    });

    expect(result.provider).toBe('PAYU');
    expect(result.status).toBe(PaymentStatus.PENDING);
    expect(result.amount).toBe(100);
    expect(result.currency).toBe('ZAR');
    expect(result.providerReference.length).toBeGreaterThan(0);
    expect(result.redirectUrl).toContain('PayUReference=');
  });

  it('supports RESERVE server-to-server authorize flow for CREDITCARD', async () => {
    const provider = new PayUProvider();

    const result = await provider.authorize({
      paymentId: 'payment_s2s_reserve_1',
      amount: 100,
      currency: 'ZAR',
      paymentMethod: 'CREDITCARD',
      transactionType: 'RESERVE',
      metadata: {
        payuAuthorizeFlow: 'DO_TRANSACTION'
      }
    });

    expect(result.provider).toBe('PAYU');
    expect(result.status).toBe(PaymentStatus.AUTHORIZED);
    expect(result.providerReference).toBe('payment_s2s_reserve_1');
    expect(result.redirectUrl).toBeUndefined();
  });

  it('supports CREDIT refund flow', async () => {
    const provider = new PayUProvider();

    const result = await provider.refund({
      transactionId: 'payu_reference_1',
      amount: 100,
      currency: 'ZAR'
    });

    expect(result.provider).toBe('PAYU');
    expect(result.status).toBe(PaymentStatus.REFUNDED);
    expect(result.providerReference).toBe('payu_reference_1');
  });

  it('supports RESERVE_CANCEL void flow', async () => {
    const provider = new PayUProvider();

    const result = await provider.void({
      transactionId: 'payu_reference_2',
      amount: 100,
      currency: 'ZAR'
    });

    expect(result.provider).toBe('PAYU');
    expect(result.status).toBe(PaymentStatus.RESERVE_CANCEL);
    expect(result.providerReference).toBe('payu_reference_2');
  });
});
