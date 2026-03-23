import request from 'supertest';
import { app } from '../../src/app';

describe('Transaction Logs API', () => {
  it('returns raw provider response for a transaction', async () => {
    const created = await request(app)
      .post('/payments')
      .set('idempotency-key', 'idem-log-check-1')
      .send({
        provider: 'PAYU',
        amount: 120,
        currency: 'ZAR'
      });

    expect(created.status).toBe(201);

    const logs = await request(app).get(`/transactions/${created.body.id}/logs`);

    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.body)).toBe(true);
    expect(logs.body.length).toBeGreaterThan(0);
    expect(logs.body[0].response).toBeDefined();
  });
});
