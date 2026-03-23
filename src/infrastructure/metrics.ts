import client from 'prom-client';

client.collectDefaultMetrics();

export const providerLatencyHistogram = new client.Histogram({
  name: 'provider_http_latency_seconds',
  help: 'Provider HTTP latency in seconds',
  labelNames: ['provider', 'operation']
});

export const paymentAttemptCounter = new client.Counter({
  name: 'payment_attempt_total',
  help: 'Total payment attempts',
  labelNames: ['provider', 'status']
});

export const metricsRegistry = client.register;
