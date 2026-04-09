import { env } from '../../config/env';
import { PaymentStatus } from '../../domain/enums';
import { requestWithRetry } from '../../infrastructure/http.client';
import { mapPeachStatusWithType } from './peach.status';

interface PeachCardManagementResponse {
  id?: string;
  paymentType?: string;
  amount?: string;
  currency?: string;
  result?: { code?: string; description?: string };
}

export interface PeachCardOperationInput {
  uniqueTransactionId: string;
  amount: number;
  currency: string;
}

export interface PeachCardOperationResult {
  providerReference: string;
  status: PaymentStatus;
  rawResponse: unknown;
}

const executeCardOperation = async (
  input: PeachCardOperationInput,
  paymentType: 'CP' | 'RV'
): Promise<PeachCardOperationResult> => {
  const baseUrl = env.peach.cardApiBaseUrl;

  const body = new URLSearchParams({
    paymentType,
    amount: input.amount.toFixed(2),
    currency: input.currency
  }).toString();

  const response = await requestWithRetry<PeachCardManagementResponse>({
    method: 'POST',
    url: `${baseUrl}/v1/payments/${encodeURIComponent(input.uniqueTransactionId)}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${env.peach.cardApiBearerToken}`
    },
    data: body
  });

  const resultCode = response.result?.code ?? '';
  const providerReference = response.id ?? input.uniqueTransactionId;

  return {
    providerReference,
    status: mapPeachStatusWithType(resultCode, paymentType),
    rawResponse: response
  };
};

export const capturePeachPayment = async (input: PeachCardOperationInput): Promise<PeachCardOperationResult> => {
  return executeCardOperation(input, 'CP');
};

export const reversePeachPayment = async (input: PeachCardOperationInput): Promise<PeachCardOperationResult> => {
  return executeCardOperation(input, 'RV');
};
