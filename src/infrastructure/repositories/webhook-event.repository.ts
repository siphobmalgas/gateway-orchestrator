import { WebhookEventRecord } from '../../domain/webhook-event.entity';

export interface WebhookEventRepository {
  create(record: WebhookEventRecord): Promise<void>;
  findByDedupeKey(dedupeKey: string): Promise<WebhookEventRecord | null>;
  listByPaymentId(paymentId: string): Promise<WebhookEventRecord[]>;
  update(record: WebhookEventRecord): Promise<void>;
}