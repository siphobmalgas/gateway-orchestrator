import { PayUProvider } from '../../src/providers/payu/payu.provider';
import { PaymentStatus } from '../../src/domain/enums';
import { PayURedirectPaymentMethod } from '../../src/domain/enums';

describe('PayUProvider', () => {
  it.each(['CREDITCARD', 'EFT_PRO', 'MOBICRED'] as const satisfies readonly PayURedirectPaymentMethod[])('returns redirect payment response for %s', async (method) => {
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
});
