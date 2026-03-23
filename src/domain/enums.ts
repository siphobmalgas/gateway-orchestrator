export enum PaymentProviderName {
  PAYU = 'PAYU',
  PAYFAST = 'PAYFAST',
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
  PENDING = 'PENDING'
}

export type PayURedirectPaymentMethod = 'CARD' | 'CREDITCARD' | 'EFT' | 'EFT_PRO' | 'MOBICRED';
export type PayUTransactionType = 'PAYMENT' | 'RESERVE' | 'FINALIZE';
export type PayUSetTransactionType = Exclude<PayUTransactionType, 'FINALIZE'>;
