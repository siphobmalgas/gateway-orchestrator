import { PaymentStatus } from '../../domain/enums';
import { env } from '../../config/env';
import { requestWithRetry } from '../../infrastructure/http.client';
import { mapPeachStatusWithType } from './peach.status';

interface PeachRefundResponse {
  id?: string;
  paymentType?: string;
  amount?: string;
  currency?: string;
  result?: { code?: string; description?: string };
}

export interface PeachRefundInput {
  uniqueTransactionId: string;
  amount: number;
  currency: string;
}

export interface PeachRefundResult {
  providerReference: string;
  status: PaymentStatus;
  rawResponse: unknown;
}

export const processPeachRefund = async (input: PeachRefundInput): Promise<PeachRefundResult> => {
  const baseUrl = env.peach.paymentsApiBaseUrl;

  const body = new URLSearchParams({
    'authentication.userId': env.peach.paymentsApiUserId,
    'authentication.password': env.peach.paymentsApiPassword,
    'authentication.entityId': env.peach.paymentsApiEntityId,
    paymentType: 'RF',
    amount: input.amount.toFixed(2),
    currency: input.currency
  }).toString();

  const response = await requestWithRetry<PeachRefundResponse>({
    method: 'POST',
    url: `${baseUrl}/payments/${encodeURIComponent(input.uniqueTransactionId)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body
  });

  const resultCode = response.result?.code ?? '';
  const providerReference = response.id ?? input.uniqueTransactionId;

  return {
    providerReference,
    status: mapPeachStatusWithType(resultCode, 'RF'),
    rawResponse: response
  };
};
