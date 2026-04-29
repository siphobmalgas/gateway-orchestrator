import request from 'supertest';
import { app } from '../../src/app';

const merchantRedirectContext = {
  returnUrl: 'https://merchant.example.com/payments/return',
  cancelUrl: 'https://merchant.example.com/payments/cancel',
  notificationUrl: 'https://merchant.example.com/webhooks/payu'
};

describe('Onboarding API', () => {
  it('registers PAYU provider credentials with merchant details', async () => {
    const res = await request(app).post('/providers/register').send({
      provider: 'PAYU',
      merchantIdentifier: 'merchant-001',
      merchantName: 'Acme Retail',
      payuCredentials: {
        username: '200021',
        password: 'WSAUFbw6',
        safekey: '{07F70723-1B96-4B97-B891-7BF708594EEA}'
      }
    });

    expect(res.status).toBe(201);
    expect(res.body.registered).toBe(true);
    expect(res.body.provider).toBe('PAYU');
  });

  it('registers PAYFLEX oauth credentials with merchant details', async () => {
    const res = await request(app).post('/providers/register').send({
      provider: 'PAYFLEX',
      merchantIdentifier: 'merchant-payflex-001',
      merchantName: 'Acme Flex',
      payflexCredentials: {
        clientId: 'payflex-client-id',
        clientSecret: 'payflex-client-secret',
        authUrl: 'https://auth-uat.payflex.co.za/auth/merchant',
        audience: 'https://auth-dev.payflex.co.za'
      }
    });

    expect(res.status).toBe(201);
    expect(res.body.registered).toBe(true);
    expect(res.body.provider).toBe('PAYFLEX');
  });

  it('creates merchant and lists transactions', async () => {
    const merchantRes = await request(app).post('/merchants').send({
      merchantIdentifier: 'merchant-002',
      merchantName: 'Demo Store'
    });

    expect(merchantRes.status).toBe(201);
    expect(merchantRes.body.merchantIdentifier).toBe('merchant-002');
    expect(merchantRes.body.merchantName).toBe('Demo Store');

    await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-transactions-list')
      .send({
        provider: 'PAYU',
        amount: 100,
        currency: 'ZAR',
        redirectContext: merchantRedirectContext
      });

    const txRes = await request(app).get('/transactions');

    expect(txRes.status).toBe(200);
    expect(Array.isArray(txRes.body)).toBe(true);
    expect(txRes.body.length).toBeGreaterThan(0);
    expect(txRes.body[0]).toHaveProperty('redirectLink');
    expect(txRes.body[0]).toHaveProperty('inlineRedirect');
  });

  it('creates routing rules and routes merchant payments without an explicit provider', async () => {
    const merchantIdentifier = 'merchant-routed-int';

    const merchantRes = await request(app).post('/merchants').send({
      merchantIdentifier,
      merchantName: 'Routed Store'
    });

    expect(merchantRes.status).toBe(201);

    const providerRes = await request(app).post('/providers/register').send({
      provider: 'PAYU',
      merchantIdentifier,
      merchantName: 'Routed Store',
      payuCredentials: {
        username: '200021',
        password: 'WSAUFbw6',
        safekey: '{07F70723-1B96-4B97-B891-7BF708594EEA}'
      }
    });

    expect(providerRes.status).toBe(201);

    const routeRes = await request(app).post('/routing-rules').send({
      merchantIdentifier,
      routeToProvider: 'PAYU',
      priority: 0,
      paymentMethod: 'MOBICRED',
      enabled: true
    });

    expect(routeRes.status).toBe(201);
    expect(routeRes.body.routeToProvider).toBe('PAYU');

    const paymentRes = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-routed-integration')
      .send({
        merchantIdentifier,
        amount: 145,
        currency: 'ZAR',
        paymentMethod: 'MOBICRED',
        redirectContext: merchantRedirectContext
      });

    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.provider).toBe('PAYU');
    expect(paymentRes.body.status).toBe('PENDING');
    expect(paymentRes.body.checkoutUrl).toContain('PayUReference=');
  });
});
