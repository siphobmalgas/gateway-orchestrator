import { PaymentStatus } from '../../domain/enums';
import { LookupTransactionResult } from '../../domain/provider.interface';
import { env } from '../../config/env';
import { requestWithRetry } from '../../infrastructure/http.client';
import { generatePeachSignature } from './peach.signature';

export const mapPeachStatusWithType = (resultCode: string, paymentType: string): PaymentStatus => {
  if (!resultCode) return PaymentStatus.UNKNOWN;

  const isSuccess = resultCode.startsWith('000.0') || resultCode.startsWith('000.1');
  const isPending = resultCode.startsWith('000.2');

  if (isPending) return PaymentStatus.PENDING;
  if (!isSuccess) return PaymentStatus.FAILED;

  switch (paymentType) {
    case 'PA':
      return PaymentStatus.AUTHORIZED;
    case 'DB':
      return PaymentStatus.CAPTURED;
    case 'RF':
      return PaymentStatus.REFUNDED;
    case 'CP':
      return PaymentStatus.CAPTURED;
    case 'RV':
      return PaymentStatus.VOIDED;
    default:
      return PaymentStatus.CAPTURED;
  }
};

interface PeachStatusPayment {
  id?: string;
  paymentType?: string;
  paymentBrand?: string;
  amount?: string;
  currency?: string;
  result?: { code?: string; description?: string };
}

interface PeachStatusResponse {
  id?: string;
  amount?: string;
  currency?: string;
  paymentType?: string;
  paymentBrand?: string;
  merchantTransactionId?: string;
  result?: { code?: string; description?: string };
  payments?: PeachStatusPayment[];
}

export const queryPeachTransactionStatus = async (merchantTransactionId: string): Promise<LookupTransactionResult> => {
  const baseUrl = env.peach.checkoutBaseUrl;
  const entityId = env.peach.entityId;
  const secretToken = env.peach.secretToken;

  const params: Record<string, string> = {
    'authentication.entityId': entityId,
    merchantTransactionId
  };

  const signature = generatePeachSignature(params, secretToken);
  const queryString = new URLSearchParams({ ...params, signature }).toString();

  const response = await requestWithRetry<PeachStatusResponse>({
    method: 'GET',
    url: `${baseUrl}/status?${queryString}`
  });

  const lastPayment = response.payments?.[response.payments.length - 1];
  const resultCode = lastPayment?.result?.code ?? response.result?.code ?? '';
  const resultMessage = lastPayment?.result?.description ?? response.result?.description ?? '';
  const paymentType = lastPayment?.paymentType ?? response.paymentType ?? 'DB';
  const providerReference = lastPayment?.id ?? response.id ?? '';
  const amountStr = lastPayment?.amount ?? response.amount ?? '0';
  const currency = lastPayment?.currency ?? response.currency ?? 'ZAR';

  return {
    providerReference,
    merchantReference: merchantTransactionId,
    transactionState: resultCode,
    transactionType: paymentType,
    status: mapPeachStatusWithType(resultCode, paymentType),
    amountInCents: Math.round(parseFloat(amountStr) * 100),
    currency,
    resultCode,
    resultMessage,
    rawResponse: response
  };
};
