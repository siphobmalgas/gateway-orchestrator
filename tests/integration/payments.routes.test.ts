import request from 'supertest';
import { app } from '../../src/app';

const createAuthorizedS2SPayment = async (idempotencyKey: string) =>
  request(app)
    .post('/authorise')
    .set('idempotency-key', idempotencyKey)
    .send({
      provider: 'PAYU',
      amount: 120,
      currency: 'ZAR',
      paymentMethod: 'CREDITCARD',
      transactionType: 'RESERVE',
      metadata: {
        payuAuthorizeFlow: 'DO_TRANSACTION',
        firstName: 'Sipho',
        lastName: 'Mthembu',
        email: 'sipho@example.com',
        mobile: '27821234567',
        cardNumber: '4111120000005078',
        cardExpiry: '122030',
        cvv: '123',
        nameOnCard: 'Sipho Mthembu'
      }
    });

describe('Payments API', () => {
  it('rejects PAYFLEX payment requests without required customer metadata', async () => {
    const res = await request(app)
      .post('/payment')
      .set('idempotency-key', 'idem-payflex-missing-payment')
      .send({
        provider: 'PAYU',
        amount: 300,
        currency: 'ZAR',
        paymentMethod: 'PAYFLEX',
        transactionType: 'PAYMENT'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('PAYFLEX requires metadata fields:');
    expect(res.body.error).toContain('firstName');
    expect(res.body.error).toContain('lastName');
    expect(res.body.error).toContain('mobile');
    expect(res.body.error).toContain('email');
  });

  it('rejects PAYFLEX authorize requests without required customer metadata', async () => {
    const res = await request(app)
      .post('/authorise')
      .set('idempotency-key', 'idem-payflex-missing-authorise')
      .send({
        provider: 'PAYU',
        amount: 300,
        currency: 'ZAR',
        paymentMethod: 'PAYFLEX',
        transactionType: 'RESERVE'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('PAYFLEX requires metadata fields:');
    expect(res.body.error).toContain('firstName');
    expect(res.body.error).toContain('lastName');
    expect(res.body.error).toContain('mobile');
    expect(res.body.error).toContain('email');
  });

  it('rejects S2S doTransaction authorize requests without required card metadata', async () => {
    const res = await request(app)
      .post('/authorise')
      .set('idempotency-key', 'idem-s2s-missing-card-fields')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        paymentMethod: 'CREDITCARD',
        transactionType: 'RESERVE',
        metadata: {
          payuAuthorizeFlow: 'DO_TRANSACTION'
        }
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('DO_TRANSACTION requires metadata fields:');
    expect(res.body.error).toContain('cardNumber');
    expect(res.body.error).toContain('cardExpiry');
    expect(res.body.error).toContain('cvv');
    expect(res.body.error).toContain('nameOnCard');
  });

  it('supports /authorise endpoint', async () => {
    const res = await request(app)
      .post('/authorise')
      .set('idempotency-key', 'idem-authorise-flow')
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
  });

  it('supports explicit payment flow endpoint', async () => {
    const res = await request(app)
      .post('/payment')
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

  it('supports PAYFLEX as a standalone provider', async () => {
    const res = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-payflex-provider')
      .send({
        provider: 'PAYFLEX',
        amount: 199,
        currency: 'ZAR',
        redirectContext: {
          returnUrl: 'https://merchant.example.com/payflex/confirm',
          cancelUrl: 'https://merchant.example.com/payflex/cancel',
          notificationUrl: 'https://merchant.example.com/webhooks/payflex'
        },
        metadata: {
          firstName: 'Sipho',
          lastName: 'Mthembu',
          email: 'payflextest+provider@gmail.com',
          mobile: '0123456789'
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.provider).toBe('PAYFLEX');
    expect(res.body.status).toBe('PENDING');
    expect(res.body.providerReference).toMatch(/[0-9a-f-]{36}/i);
    expect(res.body.redirectUrl).toContain('checkout.payflex');
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

  it('persists provider-status lookup results to the payment record', async () => {
    const created = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-provider-status-persist')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        transactionType: 'PAYMENT'
      });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING');

    const lookup = await request(app).get(`/payments/${created.body.id}/provider-status`);

    expect(lookup.status).toBe(200);
    expect(lookup.body.status).toBe('AUTHORIZED');

    const payment = await request(app).get(`/payments/${created.body.id}`);

    expect(payment.status).toBe(200);
    expect(payment.body.status).toBe('AUTHORIZED');
  });

  it('refreshes provider state when fetching a payment by id', async () => {
    const created = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-provider-refresh-get')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        transactionType: 'PAYMENT'
      });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING');

    const payment = await request(app).get(`/payments/${created.body.id}`);

    expect(payment.status).toBe(200);
    expect(payment.body.status).toBe('AUTHORIZED');
  });

  it('supports FINALIZE capture flow and persists CAPTURED status', async () => {
    const created = await createAuthorizedS2SPayment('idem-s2s-finalize');

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('AUTHORIZED');

    const capture = await request(app).post(`/payments/${created.body.id}/capture`).send({});

    expect(capture.status).toBe(200);
    expect(capture.body.status).toBe('CAPTURED');

    const payment = await request(app).get(`/payments/${created.body.id}`);

    expect(payment.status).toBe(200);
    expect(payment.body.status).toBe('CAPTURED');
  });

  it('supports CREDIT refund flow and persists REFUNDED status', async () => {
    const created = await createAuthorizedS2SPayment('idem-s2s-credit');

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('AUTHORIZED');

    const refund = await request(app)
      .post(`/payments/${created.body.id}/refund`)
      .send({
        amount: 120,
        currency: 'ZAR'
      });

    expect(refund.status).toBe(200);
    expect(refund.body.status).toBe('REFUNDED');

    const payment = await request(app).get(`/payments/${created.body.id}`);

    expect(payment.status).toBe(200);
    expect(payment.body.status).toBe('REFUNDED');
  });

  it('supports RESERVE_CANCEL void flow and persists VOIDED status', async () => {
    const created = await createAuthorizedS2SPayment('idem-s2s-reserve-cancel');

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('AUTHORIZED');

    const voided = await request(app).post(`/payments/${created.body.id}/void`).send({});

    expect(voided.status).toBe(200);
    expect(voided.body.status).toBe('VOIDED');

    const payment = await request(app).get(`/payments/${created.body.id}`);

    expect(payment.status).toBe(200);
    expect(payment.body.status).toBe('VOIDED');
  });
});
