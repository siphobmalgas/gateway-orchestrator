import { PaymentProviderName, PaymentStatus } from './enums';

export interface Payment {
  id: string;
  provider: PaymentProviderName;
  amount: number;
  currency: string;
  status: PaymentStatus;
  providerReference?: string;
  checkoutUrl?: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const stateTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.CREATED]: [PaymentStatus.AUTHORIZED,PaymentStatus.PENDING ,PaymentStatus.FAILED, PaymentStatus.DECLINED],
  [PaymentStatus.PENDING]: [PaymentStatus.AUTHORIZED, PaymentStatus.FAILED, PaymentStatus.DECLINED],
  [PaymentStatus.AUTHORIZED]: [PaymentStatus.CAPTURED, PaymentStatus.REFUNDED, PaymentStatus.FAILED],
  [PaymentStatus.CAPTURED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.DECLINED]: []
};

export const ensureTransition = (from: PaymentStatus, to: PaymentStatus): void => {
  if (!stateTransitions[from].includes(to)) {
    throw new Error(`Invalid payment status transition: ${from} -> ${to}`);
  }
};
