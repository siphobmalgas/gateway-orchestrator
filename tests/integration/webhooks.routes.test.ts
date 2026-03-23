import { createHmac } from 'crypto';
import request from 'supertest';
import { app } from '../../src/app';

describe('Webhook API', () => {
  it('accepts valid signed webhook', async () => {
    const payload = JSON.stringify({ event: 'payment.updated' });
    const signature = createHmac('sha256', 'payu_dev_secret').update(payload).digest('hex');

    const res = await request(app)
      .post('/webhooks/payu')
      .set('x-signature', signature)
      .set('content-type', 'text/plain')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
  });

  it('rejects invalid signed webhook', async () => {
    const payload = JSON.stringify({ event: 'payment.updated' });

    const res = await request(app)
      .post('/webhooks/payu')
      .set('x-signature', 'invalid')
      .set('content-type', 'text/plain')
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('accepts payu xml ipn without x-signature when response hash exists', async () => {
    const payload = `<?xml version="1.0" encoding="UTF-8"?>
<PaymentNotification>
  <MerchantReference>merchant-1</MerchantReference>
  <TransactionType>PAYMENT</TransactionType>
  <TransactionState>SUCCESSFUL</TransactionState>
  <PayUReference>payu-1</PayUReference>
  <IpnExtraInfo>
    <ResponseHash>hash-1</ResponseHash>
  </IpnExtraInfo>
</PaymentNotification>`;

    const res = await request(app)
      .post('/webhooks/payu')
      .set('content-type', 'text/xml')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);

    const replay = await request(app)
      .post('/webhooks/payu')
      .set('content-type', 'text/xml')
      .send(payload);

    expect(replay.status).toBe(200);
    expect(replay.body.accepted).toBe(true);
  });
});
