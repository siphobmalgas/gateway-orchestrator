CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(32) NOT NULL,
  provider_reference VARCHAR(128),
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  request JSONB NOT NULL,
  response JSONB NOT NULL,
  headers JSONB NOT NULL,
  response_time_ms INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_logs_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_id ON payment_logs(payment_id);
