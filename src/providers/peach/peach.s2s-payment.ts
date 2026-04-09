import { env } from '../../config/env';
import { PaymentStatus } from '../../domain/enums';
import { requestWithRetry } from '../../infrastructure/http.client';
import { mapPeachStatusWithType } from './peach.status';

export interface PeachS2SCardInput {
  paymentBrand: string;
  paymentType: 'DB' | 'PA';
  amount: number;
  currency: string;
  shopperResultUrl: string;
  card: {
    number: string;
    holder: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
  };
  merchantTransactionId?: string;
  threeDSecure?: {
    challengeIndicator?: string;
    exemptionFlag?: string;
  };
  browser?: {
    acceptHeader?: string;
    language?: string;
    screenHeight?: string;
    screenWidth?: string;
    timezone?: string;
    userAgent?: string;
    javaEnabled?: string;
    javascriptEnabled?: string;
    screenColorDepth?: string;
    challengeWindow?: string;
  };
  customerIp?: string;
  customParameters?: Record<string, string>;
}

interface PeachS2SRedirect {
  url?: string;
  method?: string;
  parameters?: { name: string; value: string }[];
}

interface PeachS2SResponse {
  id?: string;
  paymentType?: string;
  paymentBrand?: string;
  amount?: string;
  currency?: string;
  result?: { code?: string; description?: string };
  redirect?: PeachS2SRedirect;
  threeDSecure?: Record<string, unknown>;
  card?: Record<string, unknown>;
  customParameters?: Record<string, string>;
}

export interface PeachS2SPaymentResult {
  providerReference: string;
  status: PaymentStatus;
  redirectUrl?: string;
  redirectMethod?: string;
  redirectParameters?: { name: string; value: string }[];
  rawResponse: unknown;
}

const buildFormParams = (input: PeachS2SCardInput): URLSearchParams => {
  const params = new URLSearchParams();
  params.append('entityId', env.peach.cardApiEntityId || env.peach.entityId);
  params.append('amount', input.amount.toFixed(2));
  params.append('currency', input.currency);
  params.append('paymentBrand', input.paymentBrand);
  params.append('paymentType', input.paymentType);

  params.append('card.number', input.card.number);
  params.append('card.holder', input.card.holder);
  params.append('card.expiryMonth', input.card.expiryMonth);
  params.append('card.expiryYear', input.card.expiryYear);
  params.append('card.cvv', input.card.cvv);

  params.append('shopperResultUrl', input.shopperResultUrl);

  if (input.merchantTransactionId) {
    params.append('merchantTransactionId', input.merchantTransactionId);
  }

  if (input.threeDSecure?.challengeIndicator) {
    params.append('threeDSecure.challengeIndicator', input.threeDSecure.challengeIndicator);
  }
  if (input.threeDSecure?.exemptionFlag) {
    params.append('threeDSecure.exemptionFlag', input.threeDSecure.exemptionFlag);
  }

  if (input.browser) {
    const b = input.browser;
    if (b.acceptHeader) params.append('customer.browser.acceptHeader', b.acceptHeader);
    if (b.language) params.append('customer.browser.language', b.language);
    if (b.screenHeight) params.append('customer.browser.screenHeight', b.screenHeight);
    if (b.screenWidth) params.append('customer.browser.screenWidth', b.screenWidth);
    if (b.timezone) params.append('customer.browser.timezone', b.timezone);
    if (b.userAgent) params.append('customer.browser.userAgent', b.userAgent);
    if (b.javaEnabled) params.append('customer.browser.javaEnabled', b.javaEnabled);
    if (b.javascriptEnabled) params.append('customer.browser.javascriptEnabled', b.javascriptEnabled);
    if (b.screenColorDepth) params.append('customer.browser.screenColorDepth', b.screenColorDepth);
    if (b.challengeWindow) params.append('customer.browser.challengeWindow', b.challengeWindow);
  }

  if (input.customerIp) {
    params.append('customer.ip', input.customerIp);
  }

  if (input.customParameters) {
    for (const [key, value] of Object.entries(input.customParameters)) {
      params.append(`customParameters[${key}]`, value);
    }
  }

  return params;
};

const isPending3DS = (response: PeachS2SResponse): boolean => {
  return !!response.redirect?.url;
};

export const executePeachS2SCardPayment = async (
  input: PeachS2SCardInput
): Promise<PeachS2SPaymentResult> => {
  const baseUrl = env.peach.cardApiBaseUrl;
  const params = buildFormParams(input);

  const response = await requestWithRetry<PeachS2SResponse>({
    method: 'POST',
    url: `${baseUrl}/v1/payments`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${env.peach.cardApiBearerToken}`
    },
    data: params.toString()
  });

  const resultCode = response.result?.code ?? '';
  const providerReference = response.id ?? '';

  if (isPending3DS(response)) {
    return {
      providerReference,
      status: PaymentStatus.PENDING_3DS,
      redirectUrl: response.redirect!.url,
      redirectMethod: response.redirect!.method ?? 'POST',
      redirectParameters: response.redirect!.parameters,
      rawResponse: response
    };
  }

  return {
    providerReference,
    status: mapPeachStatusWithType(resultCode, input.paymentType),
    rawResponse: response
  };
};

export const getPeachS2SPaymentStatus = async (
  paymentId: string
): Promise<PeachS2SPaymentResult> => {
  const baseUrl = env.peach.cardApiBaseUrl;

  const response = await requestWithRetry<PeachS2SResponse>({
    method: 'GET',
    url: `${baseUrl}/v1/payments/${encodeURIComponent(paymentId)}?entityId=${encodeURIComponent(env.peach.cardApiEntityId || env.peach.entityId)}`,
    headers: {
      Authorization: `Bearer ${env.peach.cardApiBearerToken}`
    }
  });

  const resultCode = response.result?.code ?? '';
  const paymentType = response.paymentType ?? 'DB';

  return {
    providerReference: response.id ?? paymentId,
    status: mapPeachStatusWithType(resultCode, paymentType),
    rawResponse: response
  };
};
