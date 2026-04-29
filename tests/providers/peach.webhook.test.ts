import { parsePeachWebhook } from '../../src/providers/peach/peach.webhook';
import { PaymentStatus } from '../../src/domain/enums';

describe('parsePeachWebhook', () => {
  const merchantTransactionIdMap = new Map<string, string>();

  beforeEach(() => {
    merchantTransactionIdMap.clear();
    merchantTransactionIdMap.set('abc123def456gh78', 'full-uuid-payment-id-here');
  });

  it('parses a form-encoded webhook body', () => {
    const body = 'merchantTransactionId=abc123def456gh78&id=peach_txn_001&paymentType=DB&result.code=000.100.110';

    const event = parsePeachWebhook(body, merchantTransactionIdMap);

    expect(event).not.toBeNull();
    expect(event!.merchantReference).toBe('full-uuid-payment-id-here');
    expect(event!.providerReference).toBe('peach_txn_001');
    expect(event!.status).toBe(PaymentStatus.CAPTURED);
  });

  it('parses a JSON webhook payload', () => {
    const payload = {
      merchantTransactionId: 'abc123def456gh78',
      id: 'peach_txn_002',
      paymentType: 'PA',
      result: { code: '000.100.112', description: 'Request successfully processed' }
    };

    const event = parsePeachWebhook(payload, merchantTransactionIdMap);

    expect(event).not.toBeNull();
    expect(event!.merchantReference).toBe('full-uuid-payment-id-here');
    expect(event!.providerReference).toBe('peach_txn_002');
    expect(event!.status).toBe(PaymentStatus.AUTHORIZED);
  });

  it('parses a JSON string webhook payload', () => {
    const payload = JSON.stringify({
      merchantTransactionId: 'abc123def456gh78',
      id: 'peach_txn_003',
      paymentType: 'RF',
      result: { code: '000.100.110' }
    });

    const event = parsePeachWebhook(payload, merchantTransactionIdMap);

    expect(event).not.toBeNull();
    expect(event!.status).toBe(PaymentStatus.REFUNDED);
  });

  it('returns null when merchantTransactionId is missing', () => {
    const payload = { id: 'peach_txn_004', paymentType: 'DB' };

    const event = parsePeachWebhook(payload, merchantTransactionIdMap);

    expect(event).toBeNull();
  });

  it('falls back to merchantTransactionId when mapping is not found', () => {
    const payload = {
      merchantTransactionId: 'unknown_short_id',
      id: 'peach_txn_005',
      paymentType: 'DB',
      result: { code: '000.100.110' }
    };

    const event = parsePeachWebhook(payload, merchantTransactionIdMap);

    expect(event).not.toBeNull();
    expect(event!.merchantReference).toBe('unknown_short_id');
  });

  it('maps failed result codes to FAILED status', () => {
    const payload = {
      merchantTransactionId: 'abc123def456gh78',
      id: 'peach_txn_006',
      paymentType: 'DB',
      result: { code: '800.100.100' }
    };

    const event = parsePeachWebhook(payload, merchantTransactionIdMap);

    expect(event).not.toBeNull();
    expect(event!.status).toBe(PaymentStatus.FAILED);
  });

  it('maps pending result codes to PENDING status', () => {
    const payload = {
      merchantTransactionId: 'abc123def456gh78',
      id: 'peach_txn_007',
      paymentType: 'DB',
      result: { code: '000.200.000' }
    };

    const event = parsePeachWebhook(payload, merchantTransactionIdMap);

    expect(event).not.toBeNull();
    expect(event!.status).toBe(PaymentStatus.PENDING);
  });
});
