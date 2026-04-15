import { PaymentProviderName, PaymentStatus } from './enums';
import { WebhookEvent } from './provider.interface';

export const WEBHOOK_EVENT_STATES = ['STARTED', 'SUCCEEDED', 'FAILED', 'IGNORED'] as const;
export type WebhookEventState = (typeof WEBHOOK_EVENT_STATES)[number];

export interface WebhookEventRecord {
  id: string;
  provider: PaymentProviderName;
  paymentId?: string;
  merchantReference?: string;
  providerReference?: string;
  responseHash?: string;
  payloadHash: string;
  dedupeKey: string;
  signature?: string;
  rawPayload: string;
  event?: WebhookEvent | null;
  resultingPaymentStatus?: PaymentStatus;
  state: WebhookEventState;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}