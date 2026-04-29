import { MerchantNotification } from '../../domain/merchant-notification.entity';

export interface MerchantNotificationRepository {
  create(notification: MerchantNotification): Promise<void>;
  update(notification: MerchantNotification): Promise<void>;
  listByPaymentId(paymentId: string): Promise<MerchantNotification[]>;
}
