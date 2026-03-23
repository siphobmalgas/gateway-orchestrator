import request from 'supertest';
import { app } from '../../src/app';

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
        currency: 'ZAR'
      });

    const txRes = await request(app).get('/transactions');

    expect(txRes.status).toBe(200);
    expect(Array.isArray(txRes.body)).toBe(true);
    expect(txRes.body.length).toBeGreaterThan(0);
    expect(txRes.body[0]).toHaveProperty('redirectLink');
    expect(txRes.body[0]).toHaveProperty('inlineRedirect');
  });
});
