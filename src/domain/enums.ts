export enum PaymentProviderName {
  PAYU = 'PAYU',
  PAYFAST = 'PAYFAST',
  PAYFLEX = 'PAYFLEX',
  STITCH = 'STITCH',
  PEACH = 'PEACH'
}

export enum PaymentStatus {
  CREATED = 'CREATED',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  DECLINED = 'DECLINED',
  PENDING = 'PENDING',
  PENDING_3DS = 'PENDING_3DS',
  UNKNOWN = 'UNKNOWN',
  VOIDED = 'VOIDED',
  RESERVE_CANCEL = 'VOIDED',
  PAYMENT = 'PAID'

}

export const PAYU_REDIRECT_PAYMENT_METHODS = ['OPEN_BANKING', 'CREDITCARD', 'PAYFLEX', 'EFT_PRO', 'MOBICRED'] as const;
export type PayURedirectPaymentMethod = (typeof PAYU_REDIRECT_PAYMENT_METHODS)[number];

export const PAYU_TRANSACTION_TYPES = ['PAYMENT', 'RESERVE', 'FINALIZE', 'CREDIT', 'RESERVE_CANCEL'] as const;
export type PayUTransactionType = (typeof PAYU_TRANSACTION_TYPES)[number];

export const PAYU_SET_TRANSACTION_TYPES = ['PAYMENT', 'RESERVE', 'CREDIT', 'RESERVE_CANCEL'] as const;
export type PayUSetTransactionType = (typeof PAYU_SET_TRANSACTION_TYPES)[number];

export const PAYU_TRANSACTION_STATES = ['NEW', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'TIMEOUT', 'EXPIRED', 'AWAITING_PAYMENT', '3DS_PENDING'] as const;
export type PayUTransactionState = (typeof PAYU_TRANSACTION_STATES)[number];
