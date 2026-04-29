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

export const PEACH_PAYMENT_BRANDS = [
  'VISA', 'MASTER', 'AMEX', 'DINERS',
  'PAYBYBANK', 'PEACHEFT', 'NDBEFT',
  'MASTERPASS', 'PAYSHAP',
  'MOBICRED', 'RCSSTORECARDS',
  'PAYFLEX', 'ZEROPAY', 'FLOAT', 'HAPPYPAY'
] as const;
export type PeachPaymentBrand = (typeof PEACH_PAYMENT_BRANDS)[number];

export const PEACH_CARD_BRANDS: readonly PeachPaymentBrand[] = ['VISA', 'MASTER', 'AMEX', 'DINERS'];

export const PEACH_PAYMENT_TYPES = ['DB', 'PA', 'RF', 'CP', 'RV'] as const;
export type PeachPaymentType = (typeof PEACH_PAYMENT_TYPES)[number];
