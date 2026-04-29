ALTER TABLE merchants ADD COLUMN webhook_url TEXT NULL AFTER merchant_name;

CREATE TABLE IF NOT EXISTS merchant_notifications (
  id VARCHAR(36) PRIMARY KEY,
  payment_id VARCHAR(36) NOT NULL,
  merchant_identifier VARCHAR(128) NOT NULL,
  event VARCHAR(64) NOT NULL,
  webhook_url TEXT NOT NULL,
  request_payload JSON NOT NULL,
  response_status INT NULL,
  response_body TEXT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  next_retry_at DATETIME(3) NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_merchant_notifications_payment_id (payment_id),
  KEY idx_merchant_notifications_merchant (merchant_identifier),
  KEY idx_merchant_notifications_state (state),
  CONSTRAINT fk_merchant_notifications_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
