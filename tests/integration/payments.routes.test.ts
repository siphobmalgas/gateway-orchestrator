import request from 'supertest';
import { app } from '../../src/app';

const merchantRedirectContext = {
  returnUrl: 'https://merchant.example.com/payments/return',
  cancelUrl: 'https://merchant.example.com/payments/cancel',
  notificationUrl: 'https://merchant.example.com/webhooks/payu'
};

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
      flowType: 'SERVER_TO_SERVER',
      metadata: {
        firstName: 'Sipho',
        lastName: 'Mthembu',
        email: 'sipho@example.com',
        mobile: '27821234567',
        cardNumber: '4111120000005078',
        cardExpiry: '122030',
        cvv: '123',
        nameOnCard: 'Sipho Mthembu'
      },
      redirectContext: merchantRedirectContext
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
        flowType: 'SERVER_TO_SERVER'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('DO_TRANSACTION requires metadata fields:');
    expect(res.body.error).toContain('cardNumber');
    expect(res.body.error).toContain('cardExpiry');
    expect(res.body.error).toContain('cvv');
    expect(res.body.error).toContain('nameOnCard');
  });

  it('rejects PayU redirect requests without merchant return and cancel URLs', async () => {
    const res = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-missing-merchant-redirect-urls')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('PAYU redirect flows require redirectContext fields:');
    expect(res.body.error).toContain('returnUrl');
    expect(res.body.error).toContain('cancelUrl');
  });

  it('rejects secure3d S2S doTransaction requests without merchant return and cancel URLs', async () => {
    const res = await request(app)
      .post('/authorise')
      .set('idempotency-key', 'idem-s2s-secure3d-missing-redirect-urls')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        paymentMethod: 'CREDITCARD',
        transactionType: 'RESERVE',
        flowType: 'SERVER_TO_SERVER',
        metadata: {
          secure3d: true,
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

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('DO_TRANSACTION secure3d requires redirectContext fields:');
    expect(res.body.error).toContain('returnUrl');
    expect(res.body.error).toContain('cancelUrl');
  });

  it('supports /authorise endpoint', async () => {
    const res = await request(app)
      .post('/authorise')
      .set('idempotency-key', 'idem-authorise-flow')
      .send({
        provider: 'PAYU',
        amount: 220,
        currency: 'ZAR',
        paymentMethod: 'MOBICRED',
        redirectContext: merchantRedirectContext
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
        paymentMethod: 'MOBICRED',
        redirectContext: merchantRedirectContext
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
        currency: 'zar',
        redirectContext: merchantRedirectContext
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
        currency: 'ZAR',
        redirectContext: merchantRedirectContext
      });

    const second = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-repeat')
      .send({
        provider: 'PAYU',
        amount: 99,
        currency: 'ZAR',
        redirectContext: merchantRedirectContext
      });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).toBe(second.body.id);
  });

  it('returns 409 when the same idempotency key is reused with a different create body', async () => {
    const first = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-repeat-conflict')
      .send({
        provider: 'PAYU',
        amount: 99,
        currency: 'ZAR',
        redirectContext: merchantRedirectContext
      });

    const second = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-repeat-conflict')
      .send({
        provider: 'PAYU',
        amount: 149,
        currency: 'ZAR',
        redirectContext: merchantRedirectContext
      });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
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
        transactionType: 'PAYMENT',
        redirectContext: merchantRedirectContext
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

  it('does not reconcile duplicate payu ipn deliveries twice', async () => {
    const created = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-ipn-dedupe')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        transactionType: 'PAYMENT',
        redirectContext: merchantRedirectContext
      });

    expect(created.status).toBe(201);

    const ipnPayload = `<?xml version="1.0" encoding="UTF-8"?>
<PaymentNotification>
  <MerchantReference>${created.body.id}</MerchantReference>
  <TransactionType>PAYMENT</TransactionType>
  <TransactionState>SUCCESSFUL</TransactionState>
  <PayUReference>${created.body.providerReference}</PayUReference>
  <IpnExtraInfo>
    <ResponseHash>ipn-dedupe-${created.body.id}</ResponseHash>
  </IpnExtraInfo>
</PaymentNotification>`;

    const firstWebhook = await request(app)
      .post('/webhooks/payu')
      .set('content-type', 'text/xml')
      .send(ipnPayload);

    const secondWebhook = await request(app)
      .post('/webhooks/payu')
      .set('content-type', 'text/xml')
      .send(ipnPayload);

    expect(firstWebhook.status).toBe(200);
    expect(secondWebhook.status).toBe(200);

    const logs = await request(app).get(`/transactions/${created.body.id}/logs`);
    const webhookLogs = logs.body.filter((entry: { request?: { operation?: string } }) => entry.request?.operation === 'webhook');

    expect(logs.status).toBe(200);
    expect(webhookLogs).toHaveLength(1);
  });

  it('persists provider-status lookup results to the payment record', async () => {
    const created = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-provider-status-persist')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        transactionType: 'PAYMENT',
        redirectContext: merchantRedirectContext
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

  it('accepts flowType SERVER_TO_SERVER as an explicit S2S selector', async () => {
    const res = await request(app)
      .post('/authorise')
      .set('idempotency-key', 'idem-flowtype-s2s')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        paymentMethod: 'CREDITCARD',
        transactionType: 'RESERVE',
        flowType: 'SERVER_TO_SERVER',
        metadata: {
          firstName: 'Sipho',
          lastName: 'Mthembu',
          email: 'sipho@example.com',
          mobile: '27821234567',
          cardNumber: '4111120000005078',
          cardExpiry: '122030',
          cvv: '123',
          nameOnCard: 'Sipho Mthembu'
        },
        redirectContext: merchantRedirectContext
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('AUTHORIZED');
    expect(res.body.provider).toBe('PAYU');
  });

  it('accepts flowType REDIRECT as an explicit redirect selector', async () => {
    const res = await request(app)
      .post('/authorise')
      .set('idempotency-key', 'idem-flowtype-redirect')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        paymentMethod: 'CREDITCARD',
        transactionType: 'RESERVE',
        flowType: 'REDIRECT',
        redirectContext: merchantRedirectContext
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.checkoutUrl).toContain('PayUReference=');
  });

  it('validates S2S card fields when flowType is SERVER_TO_SERVER', async () => {
    const res = await request(app)
      .post('/authorise')
      .set('idempotency-key', 'idem-flowtype-s2s-validation')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR',
        paymentMethod: 'CREDITCARD',
        transactionType: 'RESERVE',
        flowType: 'SERVER_TO_SERVER'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('DO_TRANSACTION requires metadata fields:');
  });
});
