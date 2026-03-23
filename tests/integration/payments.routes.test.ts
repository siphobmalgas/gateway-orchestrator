import request from 'supertest';
import { app } from '../../src/app';

describe('Payments API', () => {
  it('supports explicit payment flow endpoint', async () => {
    const res = await request(app)
      .post('/payments/payment')
      .set('idempotency-key', 'idem-payment-flow')
      .send({
        provider: 'PAYU',
        amount: 220,
        currency: 'ZAR',
        paymentMethod: 'MOBICRED'
      });

    expect(res.status).toBe(201);
    expect(res.body.provider).toBe('PAYU');
    expect(res.body.status).toBe('PENDING');
    expect(res.body.checkoutUrl).toContain('PayUReference=');
    expect(res.body.inlineRedirect).toMatchObject({
      mode: 'IFRAME',
      method: 'GET'
    });
    expect(res.body.inlineRedirect.url).toContain('PayUReference=');
  });

  it('creates payment with idempotency key', async () => {
    const res = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-123')
      .send({
        provider: 'PAYU',
        amount: 155.5,
        currency: 'zar'
      });

    expect(res.status).toBe(201);
    expect(res.body.provider).toBe('PAYU');
    expect(res.body.status).toBe('PENDING');
    expect(res.body.checkoutUrl).toContain('PayUReference=');
    expect(res.body.inlineRedirect).toMatchObject({
      mode: 'IFRAME',
      method: 'GET'
    });
    expect(res.body.inlineRedirect.fallbackUrl).toContain('PayUReference=');
    expect(res.body.idempotencyKey).toBe('idem-123');
  });

  it('returns same payment for same idempotency key', async () => {
    const first = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-repeat')
      .send({
        provider: 'PAYU',
        amount: 99,
        currency: 'ZAR'
      });

    const second = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-repeat')
      .send({
        provider: 'PAYU',
        amount: 99,
        currency: 'ZAR'
      });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).toBe(second.body.id);
  });

  it('updates payment status to captured after successful payu ipn', async () => {
    const created = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-ipn-capture')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        transactionType: 'PAYMENT'
      });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING');

    const ipnPayload = `<?xml version="1.0" encoding="UTF-8"?>
<PaymentNotification>
  <MerchantReference>${created.body.id}</MerchantReference>
  <TransactionType>PAYMENT</TransactionType>
  <TransactionState>SUCCESSFUL</TransactionState>
  <PayUReference>${created.body.providerReference}</PayUReference>
  <IpnExtraInfo>
    <ResponseHash>ipn-${created.body.id}</ResponseHash>
  </IpnExtraInfo>
</PaymentNotification>`;

    const webhookRes = await request(app)
      .post('/webhooks/payu')
      .set('content-type', 'text/xml')
      .send(ipnPayload);

    expect(webhookRes.status).toBe(200);

    const payment = await request(app).get(`/payments/${created.body.id}`);

    expect(payment.status).toBe(200);
    expect(payment.body.status).toBe('CAPTURED');
  });
});
