import { RowDataPacket } from 'mysql2/promise';
import { PaymentOperation, PaymentOperationType } from '../../domain/payment-operation.entity';
import { Payment } from '../../domain/payment.entity';
import { WebhookEventRecord } from '../../domain/webhook-event.entity';
import { getMySqlPool } from '../db/mysql.client';
import { PaymentLog, PaymentLogRepository } from './payment-log.repository';
import { PaymentOperationRepository } from './payment-operation.repository';
import { PaymentRepository } from './payment.repository';
import { WebhookEventRepository } from './webhook-event.repository';

const GLOBAL_MERCHANT_SCOPE = '';

const toStoredMerchantIdentifier = (merchantIdentifier?: string): string => merchantIdentifier ?? GLOBAL_MERCHANT_SCOPE;

const fromStoredMerchantIdentifier = (merchantIdentifier: string): string | undefined =>
  merchantIdentifier.length > 0 ? merchantIdentifier : undefined;

const toJson = (value: unknown): string => JSON.stringify(value ?? null);

const fromJson = <T>(value: unknown): T => {
  if (typeof value !== 'string') {
    return value as T;
  }

  return JSON.parse(value) as T;
};

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

type PaymentRow = RowDataPacket & {
  id: string;
  merchant_identifier: string;
  provider: Payment['provider'];
  amount: number;
  currency: string;
  status: Payment['status'];
  provider_reference: string | null;
  checkout_url: string | null;
  idempotency_key: string;
  initial_request_hash: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type PaymentLogRow = RowDataPacket & {
  id: string;
  payment_id: string;
  provider: string;
  request: string;
  response: string;
  headers: string;
  response_time_ms: number;
  created_at: Date | string;
};

type PaymentOperationRow = RowDataPacket & {
  id: string;
  payment_id: string;
  merchant_identifier: string;
  provider: PaymentOperation['provider'];
  type: PaymentOperation['type'];
  idempotency_key: string;
  request_hash: string;
  amount: number | null;
  currency: string | null;
  state: PaymentOperation['state'];
  resulting_payment_status: PaymentOperation['resultingPaymentStatus'] | null;
  provider_reference: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WebhookEventRow = RowDataPacket & {
  id: string;
  provider: WebhookEventRecord['provider'];
  payment_id: string | null;
  merchant_reference: string | null;
  provider_reference: string | null;
  response_hash: string | null;
  payload_hash: string;
  dedupe_key: string;
  signature: string | null;
  raw_payload: string;
  event: string | null;
  resulting_payment_status: WebhookEventRecord['resultingPaymentStatus'] | null;
  state: WebhookEventRecord['state'];
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const mapPaymentRow = (row: PaymentRow): Payment => ({
  id: row.id,
  merchantIdentifier: fromStoredMerchantIdentifier(row.merchant_identifier),
  provider: row.provider,
  amount: row.amount,
  currency: row.currency,
  status: row.status,
  providerReference: row.provider_reference ?? undefined,
  checkoutUrl: row.checkout_url ?? undefined,
  idempotencyKey: row.idempotency_key,
  initialRequestHash: row.initial_request_hash ?? undefined,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapPaymentLogRow = (row: PaymentLogRow): PaymentLog => ({
  id: row.id,
  paymentId: row.payment_id,
  provider: row.provider,
  request: fromJson(row.request),
  response: fromJson(row.response),
  headers: fromJson(row.headers),
  responseTimeMs: row.response_time_ms,
  createdAt: toDate(row.created_at)
});

const mapPaymentOperationRow = (row: PaymentOperationRow): PaymentOperation => ({
  id: row.id,
  paymentId: row.payment_id,
  merchantIdentifier: fromStoredMerchantIdentifier(row.merchant_identifier),
  provider: row.provider,
  type: row.type,
  idempotencyKey: row.idempotency_key,
  requestHash: row.request_hash,
  amount: row.amount ?? undefined,
  currency: row.currency ?? undefined,
  state: row.state,
  resultingPaymentStatus: row.resulting_payment_status ?? undefined,
  providerReference: row.provider_reference ?? undefined,
  errorCode: row.error_code ?? undefined,
  errorMessage: row.error_message ?? undefined,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapWebhookEventRow = (row: WebhookEventRow): WebhookEventRecord => ({
  id: row.id,
  provider: row.provider,
  paymentId: row.payment_id ?? undefined,
  merchantReference: row.merchant_reference ?? undefined,
  providerReference: row.provider_reference ?? undefined,
  responseHash: row.response_hash ?? undefined,
  payloadHash: row.payload_hash,
  dedupeKey: row.dedupe_key,
  signature: row.signature ?? undefined,
  rawPayload: row.raw_payload,
  event: row.event ? fromJson(row.event) : undefined,
  resultingPaymentStatus: row.resulting_payment_status ?? undefined,
  state: row.state,
  errorMessage: row.error_message ?? undefined,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

export class MySqlPaymentRepository implements PaymentRepository {
  async create(payment: Payment): Promise<void> {
    const pool = await getMySqlPool();
    await pool.execute(
      `
        INSERT INTO payments (
          id,
          merchant_identifier,
          provider,
          amount,
          currency,
          status,
          provider_reference,
          checkout_url,
          idempotency_key,
          initial_request_hash,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payment.id,
        toStoredMerchantIdentifier(payment.merchantIdentifier),
        payment.provider,
        payment.amount,
        payment.currency,
        payment.status,
        payment.providerReference ?? null,
        payment.checkoutUrl ?? null,
        payment.idempotencyKey,
        payment.initialRequestHash ?? null,
        payment.createdAt,
        payment.updatedAt
      ]
    );
  }

  async findById(id: string): Promise<Payment | null> {
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<PaymentRow[]>('SELECT * FROM payments WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? mapPaymentRow(rows[0]) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string, merchantIdentifier?: string): Promise<Payment | null> {
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<PaymentRow[]>(
      'SELECT * FROM payments WHERE idempotency_key = ? AND merchant_identifier = ? LIMIT 1',
      [idempotencyKey, toStoredMerchantIdentifier(merchantIdentifier)]
    );
    return rows[0] ? mapPaymentRow(rows[0]) : null;
  }

  async listAll(): Promise<Payment[]> {
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<PaymentRow[]>('SELECT * FROM payments ORDER BY created_at DESC');
    return rows.map(mapPaymentRow);
  }

  async update(payment: Payment): Promise<void> {
    const pool = await getMySqlPool();
    await pool.execute(
      `
        UPDATE payments
        SET merchant_identifier = ?,
            provider = ?,
            amount = ?,
            currency = ?,
            status = ?,
            provider_reference = ?,
            checkout_url = ?,
            idempotency_key = ?,
            initial_request_hash = ?,
            updated_at = ?
        WHERE id = ?
      `,
      [
        toStoredMerchantIdentifier(payment.merchantIdentifier),
        payment.provider,
        payment.amount,
        payment.currency,
        payment.status,
        payment.providerReference ?? null,
        payment.checkoutUrl ?? null,
        payment.idempotencyKey,
        payment.initialRequestHash ?? null,
        payment.updatedAt,
        payment.id
      ]
    );
  }
}

export class MySqlPaymentLogRepository implements PaymentLogRepository {
  async create(log: PaymentLog): Promise<void> {
    const pool = await getMySqlPool();
    await pool.execute(
      `
        INSERT INTO payment_logs (
          id,
          payment_id,
          provider,
          request,
          response,
          headers,
          response_time_ms,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        log.id,
        log.paymentId,
        log.provider,
        toJson(log.request),
        toJson(log.response),
        toJson(log.headers),
        log.responseTimeMs,
        log.createdAt
      ]
    );
  }

  async listByPaymentId(paymentId: string): Promise<PaymentLog[]> {
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<PaymentLogRow[]>(
      'SELECT * FROM payment_logs WHERE payment_id = ? ORDER BY created_at DESC',
      [paymentId]
    );
    return rows.map(mapPaymentLogRow);
  }
}

export class MySqlPaymentOperationRepository implements PaymentOperationRepository {
  async create(operation: PaymentOperation): Promise<void> {
    const pool = await getMySqlPool();
    await pool.execute(
      `
        INSERT INTO payment_operations (
          id,
          payment_id,
          merchant_identifier,
          provider,
          type,
          idempotency_key,
          request_hash,
          amount,
          currency,
          state,
          resulting_payment_status,
          provider_reference,
          error_code,
          error_message,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        operation.id,
        operation.paymentId,
        toStoredMerchantIdentifier(operation.merchantIdentifier),
        operation.provider,
        operation.type,
        operation.idempotencyKey,
        operation.requestHash,
        operation.amount ?? null,
        operation.currency ?? null,
        operation.state,
        operation.resultingPaymentStatus ?? null,
        operation.providerReference ?? null,
        operation.errorCode ?? null,
        operation.errorMessage ?? null,
        operation.createdAt,
        operation.updatedAt
      ]
    );
  }

  async findByIdempotencyKey(paymentId: string, type: PaymentOperationType, idempotencyKey: string): Promise<PaymentOperation | null> {
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<PaymentOperationRow[]>(
      `
        SELECT *
        FROM payment_operations
        WHERE payment_id = ? AND type = ? AND idempotency_key = ?
        LIMIT 1
      `,
      [paymentId, type, idempotencyKey]
    );
    return rows[0] ? mapPaymentOperationRow(rows[0]) : null;
  }

  async listByPaymentId(paymentId: string): Promise<PaymentOperation[]> {
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<PaymentOperationRow[]>(
      'SELECT * FROM payment_operations WHERE payment_id = ? ORDER BY created_at DESC',
      [paymentId]
    );
    return rows.map(mapPaymentOperationRow);
  }

  async update(operation: PaymentOperation): Promise<void> {
    const pool = await getMySqlPool();
    await pool.execute(
      `
        UPDATE payment_operations
        SET merchant_identifier = ?,
            provider = ?,
            request_hash = ?,
            amount = ?,
            currency = ?,
            state = ?,
            resulting_payment_status = ?,
            provider_reference = ?,
            error_code = ?,
            error_message = ?,
            updated_at = ?
        WHERE payment_id = ? AND type = ? AND idempotency_key = ?
      `,
      [
        toStoredMerchantIdentifier(operation.merchantIdentifier),
        operation.provider,
        operation.requestHash,
        operation.amount ?? null,
        operation.currency ?? null,
        operation.state,
        operation.resultingPaymentStatus ?? null,
        operation.providerReference ?? null,
        operation.errorCode ?? null,
        operation.errorMessage ?? null,
        operation.updatedAt,
        operation.paymentId,
        operation.type,
        operation.idempotencyKey
      ]
    );
  }
}

export class MySqlWebhookEventRepository implements WebhookEventRepository {
  async create(record: WebhookEventRecord): Promise<void> {
    const pool = await getMySqlPool();
    await pool.execute(
      `
        INSERT INTO webhook_events (
          id,
          provider,
          payment_id,
          merchant_reference,
          provider_reference,
          response_hash,
          payload_hash,
          dedupe_key,
          signature,
          raw_payload,
          event,
          resulting_payment_status,
          state,
          error_message,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        record.id,
        record.provider,
        record.paymentId ?? null,
        record.merchantReference ?? null,
        record.providerReference ?? null,
        record.responseHash ?? null,
        record.payloadHash,
        record.dedupeKey,
        record.signature ?? null,
        record.rawPayload,
        toJson(record.event),
        record.resultingPaymentStatus ?? null,
        record.state,
        record.errorMessage ?? null,
        record.createdAt,
        record.updatedAt
      ]
    );
  }

  async findByDedupeKey(dedupeKey: string): Promise<WebhookEventRecord | null> {
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<WebhookEventRow[]>(
      'SELECT * FROM webhook_events WHERE dedupe_key = ? LIMIT 1',
      [dedupeKey]
    );
    return rows[0] ? mapWebhookEventRow(rows[0]) : null;
  }

  async listByPaymentId(paymentId: string): Promise<WebhookEventRecord[]> {
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<WebhookEventRow[]>(
      'SELECT * FROM webhook_events WHERE payment_id = ? ORDER BY created_at DESC',
      [paymentId]
    );
    return rows.map(mapWebhookEventRow);
  }

  async update(record: WebhookEventRecord): Promise<void> {
    const pool = await getMySqlPool();
    await pool.execute(
      `
        UPDATE webhook_events
        SET provider = ?,
            payment_id = ?,
            merchant_reference = ?,
            provider_reference = ?,
            response_hash = ?,
            payload_hash = ?,
            signature = ?,
            raw_payload = ?,
            event = ?,
            resulting_payment_status = ?,
            state = ?,
            error_message = ?,
            updated_at = ?
        WHERE dedupe_key = ?
      `,
      [
        record.provider,
        record.paymentId ?? null,
        record.merchantReference ?? null,
        record.providerReference ?? null,
        record.responseHash ?? null,
        record.payloadHash,
        record.signature ?? null,
        record.rawPayload,
        toJson(record.event),
        record.resultingPaymentStatus ?? null,
        record.state,
        record.errorMessage ?? null,
        record.updatedAt,
        record.dedupeKey
      ]
    );
  }
}