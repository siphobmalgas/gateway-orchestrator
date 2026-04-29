import { generatePeachSignature, verifyPeachCheckoutSignature } from '../../src/providers/peach/peach.signature';

describe('Peach Signature', () => {
  const secretToken = 'test_secret_token_abc123';

  describe('generatePeachSignature', () => {
    it('generates HMAC SHA256 from sorted key-value pairs', () => {
      const params = {
        currency: 'ZAR',
        amount: '250.00',
        'authentication.entityId': 'entity_123'
      };

      const signature = generatePeachSignature(params, secretToken);

      expect(signature).toHaveLength(64);
      expect(typeof signature).toBe('string');
    });

    it('produces the same signature regardless of input key order', () => {
      const params1 = { b: '2', a: '1', c: '3' };
      const params2 = { c: '3', a: '1', b: '2' };

      expect(generatePeachSignature(params1, secretToken)).toBe(generatePeachSignature(params2, secretToken));
    });

    it('produces different signatures for different params', () => {
      const params1 = { amount: '100.00', currency: 'ZAR' };
      const params2 = { amount: '200.00', currency: 'ZAR' };

      expect(generatePeachSignature(params1, secretToken)).not.toBe(generatePeachSignature(params2, secretToken));
    });

    it('produces different signatures for different secrets', () => {
      const params = { amount: '100.00' };

      const sig1 = generatePeachSignature(params, 'secret_a');
      const sig2 = generatePeachSignature(params, 'secret_b');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifyPeachCheckoutSignature', () => {
    it('verifies a valid form-encoded webhook body', () => {
      const params = {
        'authentication.entityId': 'entity_123',
        amount: '250.00',
        currency: 'ZAR',
        merchantTransactionId: 'abc123def456gh78',
        paymentType: 'DB'
      };

      const signature = generatePeachSignature(params, secretToken);
      const formBody = Object.entries({ ...params, signature })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

      expect(verifyPeachCheckoutSignature(formBody, secretToken)).toBe(true);
    });

    it('rejects a tampered form body', () => {
      const params = {
        amount: '250.00',
        currency: 'ZAR'
      };

      const signature = generatePeachSignature(params, secretToken);
      const tampered = `amount=999.00&currency=ZAR&signature=${encodeURIComponent(signature)}`;

      expect(verifyPeachCheckoutSignature(tampered, secretToken)).toBe(false);
    });

    it('returns false when no signature is present', () => {
      const formBody = 'amount=250.00&currency=ZAR';

      expect(verifyPeachCheckoutSignature(formBody, secretToken)).toBe(false);
    });

    it('returns false with wrong secret', () => {
      const params = { amount: '100.00' };
      const signature = generatePeachSignature(params, secretToken);
      const formBody = `amount=100.00&signature=${encodeURIComponent(signature)}`;

      expect(verifyPeachCheckoutSignature(formBody, 'wrong_secret')).toBe(false);
    });
  });
});
