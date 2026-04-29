import { MerchantNotificationEvent } from './enums';

export const MERCHANT_NOTIFICATION_STATES = ['PENDING', 'SENT', 'FAILED', 'EXHAUSTED'] as const;
export type MerchantNotificationState = (typeof MERCHANT_NOTIFICATION_STATES)[number];

export interface MerchantNotification {
  id: string;
  paymentId: string;
  merchantIdentifier: string;
  event: MerchantNotificationEvent;
  webhookUrl: string;
  requestPayload: Record<string, unknown>;
  responseStatus?: number;
  responseBody?: string;
  state: MerchantNotificationState;
  attempts: number;
  nextRetryAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
