CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  merchant_identifier VARCHAR(128) NOT NULL DEFAULT '',
  provider VARCHAR(32) NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(32) NOT NULL,
  provider_reference VARCHAR(255) NULL,
  checkout_url TEXT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  initial_request_hash CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_payments_scope_idempotency (merchant_identifier, idempotency_key),
  KEY idx_payments_provider (provider),
  KEY idx_payments_status (status),
  KEY idx_payments_provider_reference (provider_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_logs (
  id VARCHAR(36) PRIMARY KEY,
  payment_id VARCHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  request JSON NOT NULL,
  response JSON NOT NULL,
  headers JSON NOT NULL,
  response_time_ms INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_payment_logs_payment_id_created_at (payment_id, created_at),
  CONSTRAINT fk_payment_logs_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_operations (
  id VARCHAR(36) PRIMARY KEY,
  payment_id VARCHAR(36) NOT NULL,
  merchant_identifier VARCHAR(128) NOT NULL DEFAULT '',
  provider VARCHAR(32) NOT NULL,
  type VARCHAR(16) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  amount DECIMAL(18, 2) NULL,
  currency VARCHAR(3) NULL,
  state VARCHAR(16) NOT NULL,
  resulting_payment_status VARCHAR(32) NULL,
  provider_reference VARCHAR(255) NULL,
  error_code VARCHAR(64) NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_payment_operations_idempotency (payment_id, type, idempotency_key),
  KEY idx_payment_operations_payment_id_created_at (payment_id, created_at),
  CONSTRAINT fk_payment_operations_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR(36) PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  payment_id VARCHAR(36) NULL,
  merchant_reference VARCHAR(255) NULL,
  provider_reference VARCHAR(255) NULL,
  response_hash VARCHAR(255) NULL,
  payload_hash CHAR(64) NOT NULL,
  dedupe_key VARCHAR(255) NOT NULL,
  signature TEXT NULL,
  raw_payload LONGTEXT NOT NULL,
  event JSON NULL,
  resulting_payment_status VARCHAR(32) NULL,
  state VARCHAR(16) NOT NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_webhook_events_dedupe_key (dedupe_key),
  KEY idx_webhook_events_payment_id_created_at (payment_id, created_at),
  KEY idx_webhook_events_provider_reference (provider_reference),
  CONSTRAINT fk_webhook_events_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
