import { PaymentProviderName, PaymentStatus } from './enums';

export interface Payment {
  id: string;
  merchantIdentifier?: string;
  provider: PaymentProviderName;
  amount: number;
  currency: string;
  status: PaymentStatus;
  providerReference?: string;
  checkoutUrl?: string;
  idempotencyKey: string;
  initialRequestHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const stateTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.CREATED]: [PaymentStatus.AUTHORIZED, PaymentStatus.PENDING, PaymentStatus.PENDING_3DS, PaymentStatus.FAILED, PaymentStatus.DECLINED],
  [PaymentStatus.PENDING]: [PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED, PaymentStatus.PENDING_3DS, PaymentStatus.FAILED, PaymentStatus.DECLINED, PaymentStatus.VOIDED, PaymentStatus.PAYMENT],
  [PaymentStatus.PENDING_3DS]: [PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED, PaymentStatus.FAILED, PaymentStatus.DECLINED, PaymentStatus.VOIDED, PaymentStatus.PAYMENT],
  [PaymentStatus.AUTHORIZED]: [PaymentStatus.CAPTURED, PaymentStatus.REFUNDED, PaymentStatus.FAILED, PaymentStatus.VOIDED, PaymentStatus.PAYMENT],
  [PaymentStatus.CAPTURED]: [PaymentStatus.REFUNDED, PaymentStatus.PAYMENT],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.DECLINED]: [],
  [PaymentStatus.UNKNOWN]: [PaymentStatus.PENDING, PaymentStatus.PENDING_3DS, PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED, PaymentStatus.FAILED, PaymentStatus.DECLINED, PaymentStatus.REFUNDED, PaymentStatus.VOIDED, PaymentStatus.PAYMENT],
  [PaymentStatus.VOIDED]: [],
  [PaymentStatus.PAYMENT]: []
};

export const ensureTransition = (from: PaymentStatus, to: PaymentStatus): void => {
  if (!stateTransitions[from].includes(to)) {
    throw new Error(`Invalid payment status transition: ${from} -> ${to}`);
  }
};
