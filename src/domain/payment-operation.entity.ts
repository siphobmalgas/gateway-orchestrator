import { PaymentProviderName, PaymentStatus } from './enums';

export const PAYMENT_OPERATION_TYPES = ['CAPTURE', 'REFUND', 'VOID'] as const;
export type PaymentOperationType = (typeof PAYMENT_OPERATION_TYPES)[number];

export const PAYMENT_OPERATION_STATES = ['STARTED', 'SUCCEEDED', 'FAILED'] as const;
export type PaymentOperationState = (typeof PAYMENT_OPERATION_STATES)[number];

export interface PaymentOperation {
  id: string;
  paymentId: string;
  merchantIdentifier?: string;
  provider: PaymentProviderName;
  type: PaymentOperationType;
  idempotencyKey: string;
  requestHash: string;
  amount?: number;
  currency?: string;
  state: PaymentOperationState;
  resultingPaymentStatus?: PaymentStatus;
  providerReference?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}