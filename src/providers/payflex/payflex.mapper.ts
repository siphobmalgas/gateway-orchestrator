import { PaymentStatus } from '../../domain/enums';
import { LookupTransactionResult, WebhookEvent } from '../../domain/provider.interface';

type PayFlexOrderResponse = {
  orderId: string;
  orderStatus?: string;
  amount?: number;
  merchantReference?: string;
  [key: string]: unknown;
};

export const mapPayFlexOrderStatus = (orderStatus: string | undefined): PaymentStatus => {
  const normalized = (orderStatus ?? '').trim().toUpperCase();

  switch (normalized) {
    case 'CREATED':
    case 'INITIATED':
      return PaymentStatus.PENDING;
    case 'APPROVED':
      return PaymentStatus.CAPTURED;
    case 'DECLINED':
    case 'ABANDONED':
      return PaymentStatus.FAILED;
    default:
      return PaymentStatus.UNKNOWN;
  }
};

export const toPayFlexLookupResult = (
  order: PayFlexOrderResponse,
  merchantReferenceFallback: string,
  currencyFallback: string
): LookupTransactionResult => ({
  providerReference: order.orderId,
  payuReference: order.orderId,
  merchantReference: order.merchantReference ?? merchantReferenceFallback,
  transactionState: order.orderStatus ?? 'UNKNOWN',
  transactionType: 'ORDER',
  status: mapPayFlexOrderStatus(order.orderStatus),
  amountInCents: Math.round((order.amount ?? 0) * 100),
  currency: currencyFallback,
  resultCode: '200',
  resultMessage: order.orderStatus ?? 'OK',
  rawResponse: order
});

export const toPayFlexWebhookEvent = (payload: PayFlexOrderResponse): WebhookEvent | null => {
  if (!payload.orderId || !payload.merchantReference) {
    return null;
  }

  return {
    merchantReference: payload.merchantReference,
    providerReference: payload.orderId,
    status: mapPayFlexOrderStatus(payload.orderStatus),
    rawPayload: payload
  };
};