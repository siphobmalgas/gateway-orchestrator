import request from 'supertest';
import { app } from '../../src/app';

const merchantRedirectContext = {
  returnUrl: 'https://merchant.example.com/payments/return',
  cancelUrl: 'https://merchant.example.com/payments/cancel',
  notificationUrl: 'https://merchant.example.com/webhooks/payu'
};

describe('Transaction Logs API', () => {
  it('returns raw provider response for a transaction', async () => {
    const created = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-log-check-1')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        redirectContext: merchantRedirectContext
      });

    expect(created.status).toBe(201);

    const logs = await request(app).get(`/transactions/${created.body.id}/logs`);

    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.body)).toBe(true);
    expect(logs.body.length).toBeGreaterThan(0);
    expect(logs.body[0].response).toBeDefined();
  });

  it('returns persisted webhook audit records for a payment', async () => {
    const created = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-webhook-audit-1')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        transactionType: 'PAYMENT',
        redirectContext: merchantRedirectContext
      });

    expect(created.status).toBe(201);

    const payload = `<?xml version="1.0" encoding="UTF-8"?>
<PaymentNotification>
  <MerchantReference>${created.body.id}</MerchantReference>
  <TransactionType>PAYMENT</TransactionType>
  <TransactionState>SUCCESSFUL</TransactionState>
  <PayUReference>${created.body.providerReference}</PayUReference>
  <IpnExtraInfo>
    <ResponseHash>audit-hash-${created.body.id}</ResponseHash>
  </IpnExtraInfo>
</PaymentNotification>`;

    const webhook = await request(app)
      .post('/webhooks/payu')
      .set('content-type', 'text/xml')
      .send(payload);

    expect(webhook.status).toBe(200);

    const audit = await request(app).get(`/transactions/${created.body.id}/webhooks`);

    expect(audit.status).toBe(200);
    expect(Array.isArray(audit.body)).toBe(true);
    expect(audit.body).toHaveLength(1);
    expect(audit.body[0]).toMatchObject({
      provider: 'PAYU',
      paymentId: created.body.id,
      responseHash: `audit-hash-${created.body.id}`,
      resultingPaymentStatus: 'CAPTURED',
      state: 'SUCCEEDED'
    });
    expect(audit.body[0].rawPayload).toContain('<PaymentNotification>');
  });
});
