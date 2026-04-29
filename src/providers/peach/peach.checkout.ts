import { randomBytes } from 'crypto';
import { env } from '../../config/env';
import { PeachPaymentBrand } from '../../domain/enums';
import { AuthorizeRequest, PaymentRequest } from '../../domain/provider.interface';
import { requestWithRetry } from '../../infrastructure/http.client';
import { generatePeachSignature } from './peach.signature';

export interface PeachCheckoutResult {
  checkoutId: string;
  redirectUrl: string;
  merchantTransactionId: string;
}

const generateNonce = (): string => randomBytes(16).toString('hex');

export const generateMerchantTransactionId = (paymentId: string): string => {
  return paymentId.replace(/-/g, '').substring(0, 16);
};

const setIfString = (params: Record<string, string>, key: string, value: unknown): void => {
  if (typeof value === 'string' && value.trim().length > 0) {
    params[key] = value;
  }
};

const stringOrDefault = (value: unknown, defaultValue: string): string => {
  return typeof value === 'string' && value.trim().length > 0 ? value : defaultValue;
};

const applyBrandSpecificParams = (
  params: Record<string, string>,
  paymentBrand: PeachPaymentBrand | undefined,
  metadata: Record<string, unknown>
): void => {
  if (paymentBrand === 'PAYSHAP') {
    setIfString(params, 'virtualAccount.bank', metadata['virtualAccount.bank']);
    params['virtualAccount.type'] = stringOrDefault(metadata['virtualAccount.type'], 'CELLPHONE');
    setIfString(params, 'virtualAccount.accountId', metadata['virtualAccount.accountId']);
  }

  if (paymentBrand === 'MOBICRED') {
    setIfString(params, 'virtualAccount.accountId', metadata['virtualAccount.accountId']);
    setIfString(params, 'virtualAccount.password', metadata['virtualAccount.password']);
  }

  if (paymentBrand === 'RCSSTORECARDS') {
    setIfString(params, 'card.number', metadata['card.number']);
  }
};

const applyCustomParameters = (params: Record<string, string>, metadata: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith('customParameters[') && typeof value === 'string') {
      params[key] = value;
    }
  }
};

const buildCheckoutParams = (
  request: PaymentRequest | AuthorizeRequest,
  paymentType: 'DB' | 'PA',
  merchantTransactionId: string,
  paymentBrand?: PeachPaymentBrand
): Record<string, string> => {
  const params: Record<string, string> = {
    'authentication.entityId': env.peach.entityId,
    amount: request.amount.toFixed(2),
    currency: request.currency,
    paymentType,
    merchantTransactionId,
    nonce: generateNonce(),
    shopperResultUrl: request.redirectContext?.returnUrl ?? env.peach.defaultShopperResultUrl,
    notificationUrl: request.redirectContext?.notificationUrl ?? env.peach.defaultNotificationUrl
  };

  if (paymentBrand) {
    params.paymentBrand = paymentBrand;
  }

  if (request.metadata) {
    applyBrandSpecificParams(params, paymentBrand, request.metadata);
    applyCustomParameters(params, request.metadata);
  }

  return params;
};

export const createPeachCheckout = async (
  request: PaymentRequest | AuthorizeRequest,
  paymentType: 'DB' | 'PA',
  paymentBrand?: PeachPaymentBrand
): Promise<PeachCheckoutResult> => {
  const merchantTransactionId = generateMerchantTransactionId(request.paymentId);
  const params = buildCheckoutParams(request, paymentType, merchantTransactionId, paymentBrand);

  const signature = generatePeachSignature(params, env.peach.secretToken);
  params.signature = signature;

  const formBody = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  const baseUrl = env.peach.checkoutBaseUrl;
  const response = await requestWithRetry<Record<string, unknown>>({
    method: 'POST',
    url: `${baseUrl}/checkout`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: formBody
  });

  const checkoutId = String(response.id ?? merchantTransactionId);

  return {
    checkoutId,
    redirectUrl: `${baseUrl}/checkout?checkoutId=${encodeURIComponent(checkoutId)}`,
    merchantTransactionId
  };
};
