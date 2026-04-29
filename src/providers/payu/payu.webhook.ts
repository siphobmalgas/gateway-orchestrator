import { PaymentStatus } from '../../domain/enums';
import { WebhookEvent } from '../../domain/provider.interface';
import { readTag } from './payu.xml';

const mapIpnStatus = (
  transactionState: string,
  transactionType: string,
  resultCode?: string,
  successful?: string
): PaymentStatus => {
  const state = transactionState.trim().toUpperCase();
  const type = transactionType.trim().toUpperCase();
  const normalizedResultCode = (resultCode ?? '').trim().toUpperCase();
  const normalizedSuccessful = (successful ?? '').trim().toLowerCase();
  const hasExplicitOutcome = normalizedResultCode.length > 0 || normalizedSuccessful.length > 0;
  const isSuccess = hasExplicitOutcome ? normalizedResultCode === '00' || normalizedSuccessful === 'true' : state === 'SUCCESSFUL';

  if (state === 'SUCCESSFUL') {
    if (!isSuccess) {
      return PaymentStatus.FAILED;
    }

    if (type === 'CREDIT') {
      return PaymentStatus.REFUNDED;
    }

    if (type === 'FINALIZE' || type === 'PAYMENT') {
      return PaymentStatus.CAPTURED;
    }

    if (type === 'RESERVE_CANCEL') {
      return PaymentStatus.VOIDED;
    }

    return PaymentStatus.AUTHORIZED;
  }

  if (['AWAITING_PAYMENT', 'PROCESSING', 'NEW', 'PENDING', 'PENDING_REVIEW', 'PARTIAL_PAYMENT', 'OVER_PAYMENT'].includes(state)) {
    return PaymentStatus.PENDING;
  }

  if (state === 'CREDIT' || state === 'REFUNDED') {
    return PaymentStatus.REFUNDED;
  }

  if (['EXPIRED', 'CANCELLED', 'FAILED', 'TIMEOUT'].includes(state)) {
    return PaymentStatus.FAILED;
  }

  if (!isSuccess) {
    return PaymentStatus.FAILED;
  }

  return PaymentStatus.PENDING;
};

export const hasPayuResponseHash = (payload: string): boolean => Boolean(readTag(payload, 'ResponseHash') || readTag(payload, 'responseHash'));

export const parsePayuWebhook = (payload: unknown): WebhookEvent | null => {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);

  const merchantReference = readTag(raw, 'MerchantReference') ?? readTag(raw, 'merchantReference');
  const payUReference = readTag(raw, 'PayUReference') ?? readTag(raw, 'payUReference');
  const transactionState = readTag(raw, 'TransactionState') ?? readTag(raw, 'transactionState');
  const transactionType = readTag(raw, 'TransactionType') ?? readTag(raw, 'transactionType') ?? 'PAYMENT';
  const resultCode = readTag(raw, 'ResultCode') ?? readTag(raw, 'resultCode');
  const successful = readTag(raw, 'Successful') ?? readTag(raw, 'successful');
  const responseHash = readTag(raw, 'ResponseHash') ?? readTag(raw, 'responseHash');

  if (!merchantReference || !payUReference || !transactionState) {
    return null;
  }

  return {
    merchantReference,
    providerReference: payUReference,
    status: mapIpnStatus(transactionState, transactionType, resultCode, successful),
    responseHash,
    rawPayload: payload,
    transactionType,
    transactionState,
    resultCode: resultCode ?? undefined
  };
};
