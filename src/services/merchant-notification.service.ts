import { randomUUID } from 'crypto';
import axios from 'axios';
import { MerchantNotificationEvent, PaymentStatus } from '../domain/enums';
import { MerchantNotification } from '../domain/merchant-notification.entity';
import { Payment } from '../domain/payment.entity';
import { Merchant } from '../domain/merchant.entity';
import { MerchantRepository } from '../infrastructure/repositories/merchant.repository';
import { MerchantNotificationRepository } from '../infrastructure/repositories/merchant-notification.repository';
import { logger } from '../infrastructure/logger';

export interface ProviderDataContext {
  source: 'provider_response' | 'webhook' | 'provider_lookup';
  providerReference?: string;
  payuReference?: string;
  transactionType?: string;
  transactionState?: string;
  resultCode?: string;
  resultMessage?: string;
  rawResponse?: unknown;
}

const STATUS_TO_EVENT: Partial<Record<PaymentStatus, MerchantNotificationEvent>> = {
  [PaymentStatus.CREATED]: 'payment.created',
  [PaymentStatus.AUTHORIZED]: 'payment.authorized',
  [PaymentStatus.CAPTURED]: 'payment.captured',
  [PaymentStatus.FAILED]: 'payment.failed',
  [PaymentStatus.REFUNDED]: 'payment.refunded',
  [PaymentStatus.VOIDED]: 'payment.voided',
  [PaymentStatus.PENDING]: 'payment.pending',
  [PaymentStatus.PAYMENT]: 'payment.captured'
};

const sanitizeProviderData = (raw: unknown): Record<string, unknown> | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const data = { ...(raw as Record<string, unknown>) };
  // Strip internal/verbose fields — keep parsed provider data only
  delete data.soapResponse;
  delete data.endpoint;
  return data;
};

const buildNotificationPayload = (
  event: MerchantNotificationEvent,
  payment: Payment,
  previousStatus?: PaymentStatus,
  providerData?: ProviderDataContext
): Record<string, unknown> => ({
  event,
  paymentId: payment.id,
  merchantIdentifier: payment.merchantIdentifier,
  provider: payment.provider,
  amount: payment.amount,
  currency: payment.currency,
  status: payment.status,
  previousStatus: previousStatus ?? null,
  providerReference: payment.providerReference ?? null,
  checkoutUrl: payment.checkoutUrl ?? null,
  providerData: providerData
    ? {
        source: providerData.source,
        providerReference: providerData.providerReference ?? null,
        payuReference: providerData.payuReference ?? null,
        transactionType: providerData.transactionType ?? null,
        transactionState: providerData.transactionState ?? null,
        resultCode: providerData.resultCode ?? null,
        resultMessage: providerData.resultMessage ?? null,
        rawResponse: sanitizeProviderData(providerData.rawResponse) ?? null
      }
    : null,
  timestamp: new Date().toISOString()
});

export class MerchantNotificationService {
  constructor(
    private readonly merchantRepository: MerchantRepository,
    private readonly notificationRepository: MerchantNotificationRepository
  ) {}

  async notifyPaymentEvent(
    payment: Payment,
    event: MerchantNotificationEvent,
    previousStatus?: PaymentStatus,
    providerData?: ProviderDataContext
  ): Promise<void> {
    if (!payment.merchantIdentifier) {
      return;
    }

    const merchant = await this.merchantRepository.findByMerchantIdentifier(payment.merchantIdentifier);
    if (!merchant?.webhookUrl) {
      logger.debug('Merchant notification skipped: no webhook URL configured', {
        paymentId: payment.id,
        merchantIdentifier: payment.merchantIdentifier,
        event
      });
      return;
    }

    const requestPayload = buildNotificationPayload(event, payment, previousStatus, providerData);
    const notification: MerchantNotification = {
      id: randomUUID(),
      paymentId: payment.id,
      merchantIdentifier: payment.merchantIdentifier,
      event,
      webhookUrl: merchant.webhookUrl,
      requestPayload,
      state: 'PENDING',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.notificationRepository.create(notification);
    await this.sendNotification(notification, merchant);
  }

  async notifyStatusChange(payment: Payment, previousStatus: PaymentStatus, providerData?: ProviderDataContext): Promise<void> {
    const event = STATUS_TO_EVENT[payment.status] ?? 'payment.updated';
    await this.notifyPaymentEvent(payment, event, previousStatus, providerData);
  }

  private async sendNotification(notification: MerchantNotification, merchant: Merchant): Promise<void> {
    notification.attempts += 1;
    notification.updatedAt = new Date();

    try {
      logger.info('Sending merchant notification', {
        notificationId: notification.id,
        paymentId: notification.paymentId,
        merchantIdentifier: notification.merchantIdentifier,
        event: notification.event,
        webhookUrl: notification.webhookUrl,
        attempt: notification.attempts
      });

      const response = await axios.post(notification.webhookUrl, notification.requestPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Notification-Id': notification.id,
          'X-Notification-Event': notification.event
        },
        timeout: 10_000,
        validateStatus: () => true
      });

      notification.responseStatus = response.status;
      notification.responseBody = typeof response.data === 'string'
        ? response.data.slice(0, 1000)
        : JSON.stringify(response.data).slice(0, 1000);

      if (response.status >= 200 && response.status < 300) {
        notification.state = 'SENT';
        logger.info('Merchant notification sent', {
          notificationId: notification.id,
          paymentId: notification.paymentId,
          event: notification.event,
          responseStatus: response.status
        });
      } else {
        notification.state = 'FAILED';
        notification.errorMessage = `HTTP ${response.status}`;
        logger.warn('Merchant notification failed', {
          notificationId: notification.id,
          paymentId: notification.paymentId,
          event: notification.event,
          responseStatus: response.status,
          attempt: notification.attempts
        });
      }
    } catch (error) {
      notification.state = 'FAILED';
      notification.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Merchant notification error', {
        notificationId: notification.id,
        paymentId: notification.paymentId,
        event: notification.event,
        error: notification.errorMessage,
        attempt: notification.attempts
      });
    }

    await this.notificationRepository.update(notification);
  }
}
