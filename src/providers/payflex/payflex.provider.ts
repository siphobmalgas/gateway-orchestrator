import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { PaymentProviderName, PaymentStatus } from '../../domain/enums';
import { AuthorizeRequest, CaptureRequest, LookupTransactionRequest, LookupTransactionResult, PaymentRequest, PaymentResponse, RefundRequest, VoidRequest, WebhookEvent } from '../../domain/provider.interface';
import { requestWithRetry } from '../../infrastructure/http.client';
import { BaseProvider } from '../shared/base.provider';
import { getPayFlexAccessToken } from './payflex.auth';
import { toPayFlexLookupResult, toPayFlexWebhookEvent } from './payflex.mapper';

type PayFlexOrderResponse = {
  token: string;
  expiryDateTime: string;
  redirectUrl: string;
  orderId: string;
  orderStatus?: string;
  merchantReference?: string;
  amount?: number;
  [key: string]: unknown;
};

type PayFlexRefundResponse = {
  refundId?: string;
  id?: string;
  refundedDateTime?: string;
  merchantReference?: string;
  amount: number;
  [key: string]: unknown;
};

const PAYFLEX_REQUIRED_METADATA_FIELDS = [
  { label: 'mobile', keys: ['mobile', 'phoneNumber'] },
  { label: 'firstName', keys: ['firstName', 'givenNames'] },
  { label: 'lastName', keys: ['lastName', 'surname'] },
  { label: 'email', keys: ['email'] }
] as const;

const readString = (metadata: Record<string, unknown> | undefined, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const readNumber = (metadata: Record<string, unknown> | undefined, key: string, fallback = 0): number => {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const readObject = (metadata: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined => {
  const value = metadata?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
};

const readItems = (metadata: Record<string, unknown> | undefined): Array<Record<string, unknown>> | undefined => {
  const value = metadata?.items;
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : undefined;
};

const getMissingRequiredMetadataFields = (metadata: Record<string, unknown> | undefined): string[] =>
  PAYFLEX_REQUIRED_METADATA_FIELDS.filter(({ keys }) => readString(metadata, ...keys) === undefined).map(({ label }) => label);

const assertRequiredMetadataFields = (metadata: Record<string, unknown> | undefined): void => {
  const missingFields = getMissingRequiredMetadataFields(metadata);
  if (missingFields.length > 0) {
    throw new Error(`PAYFLEX requires metadata fields: ${missingFields.join(', ')}`);
  }
};

const createOrderPayload = (request: PaymentRequest | AuthorizeRequest) => ({
  amount: request.amount,
  consumer: {
    phoneNumber: readString(request.metadata, 'phoneNumber', 'mobile'),
    givenNames: readString(request.metadata, 'givenNames', 'firstName'),
    surname: readString(request.metadata, 'surname', 'lastName'),
    email: readString(request.metadata, 'email')
  },
  billing: readObject(request.metadata, 'billing'),
  shipping: readObject(request.metadata, 'shipping'),
  description: readString(request.metadata, 'description') ?? `Payment ${request.paymentId}`,
  items: readItems(request.metadata),
  merchant: {
    redirectConfirmUrl: request.redirectContext?.returnUrl ?? env.payflex.defaultRedirectConfirmUrl,
    redirectCancelUrl: request.redirectContext?.cancelUrl ?? env.payflex.defaultRedirectCancelUrl,
    statusCallbackUrl: request.redirectContext?.notificationUrl ?? env.payflex.defaultStatusCallbackUrl
  },
  merchantReference: request.paymentId,
  taxAmount: readNumber(request.metadata, 'taxAmount', 0),
  shippingAmount: readNumber(request.metadata, 'shippingAmount', 0)
});

const sanitizeEmptyObjects = <T extends Record<string, unknown>>(payload: T): T => {
  const next = { ...payload } as Record<string, unknown>;

  for (const [key, value] of Object.entries(next)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((entry) => entry === undefined)) {
      delete next[key];
    }

    if (Array.isArray(value) && value.length === 0) {
      delete next[key];
    }
  }

  return next as T;
};

export class PayFlexProvider extends BaseProvider {
  constructor() {
    super(PaymentProviderName.PAYFLEX, env.payflex.baseUrl, env.payflex.apiKey, env.payflex.webhookSecret);
  }

  async payment(request: PaymentRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    assertRequiredMetadataFields(request.metadata);

    if (env.nodeEnv === 'test') {
      const response = this.normalizeResponse({
        providerReference: randomUUID(),
        amount: request.amount,
        currency: request.currency,
        status: PaymentStatus.PENDING,
        rawResponse: {
          simulated: true,
          redirectUrl: 'https://checkout.payflex.co.za/checkout?token=test-token'
        }
      });

      response.redirectUrl = 'https://checkout.payflex.co.za/checkout?token=test-token';
      this.observeLatency('payment', startedAt);
      return response;
    }

    const accessToken = await getPayFlexAccessToken();
    const order = await requestWithRetry<PayFlexOrderResponse>({
      method: 'POST',
      url: `${this.baseUrl}/order`,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      data: sanitizeEmptyObjects(createOrderPayload(request)),
      responseType: 'json'
    });

    const response = this.normalizeResponse({
      providerReference: order.orderId,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.PENDING,
      rawResponse: order
    });

    response.redirectUrl = order.redirectUrl;
    this.observeLatency('payment', startedAt);
    return response;
  }

  async authorize(request: AuthorizeRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const response = await this.payment(request);
    this.observeLatency('authorize', startedAt);
    return response;
  }

  async lookupTransaction(request: LookupTransactionRequest): Promise<LookupTransactionResult> {
    if (env.nodeEnv === 'test') {
      const orderId = request.providerReference ?? request.payuReference ?? '';
      return toPayFlexLookupResult(
        {
          orderId,
          orderStatus: 'Approved',
          amount: 0,
          merchantReference: request.merchantReference ?? orderId
        },
        request.merchantReference ?? orderId,
        'ZAR'
      );
    }

    const accessToken = await getPayFlexAccessToken();
    const orderId = request.providerReference ?? request.payuReference ?? '';
    const order = await requestWithRetry<PayFlexOrderResponse>({
      method: 'GET',
      url: `${this.baseUrl}/order/${orderId}`,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      responseType: 'json'
    });

    return toPayFlexLookupResult(order, request.merchantReference ?? orderId, 'ZAR');
  }

  async capture(_: CaptureRequest): Promise<PaymentResponse> {
    throw new Error('PAYFLEX capture is not supported by the documented integration');
  }

  async refund(request: RefundRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();

    if (env.nodeEnv === 'test') {
      const response = this.normalizeResponse({
        providerReference: request.transactionId,
        amount: request.amount,
        currency: request.currency,
        status: PaymentStatus.REFUNDED,
        rawResponse: {
          simulated: true,
          refundId: `refund_${request.transactionId}`,
          merchantReference: request.merchantReference ?? request.transactionId
        }
      });

      this.observeLatency('refund', startedAt);
      return response;
    }

    const accessToken = await getPayFlexAccessToken();
    const refund = await requestWithRetry<PayFlexRefundResponse>({
      method: 'POST',
      url: `${this.baseUrl}/order/${request.transactionId}/refund`,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        amount: request.amount,
        currency: request.currency,
        merchantReference: request.merchantReference ?? request.transactionId,
        requestId: randomUUID(),
        webhookUrl: env.payflex.defaultRefundWebhookUrl
      },
      responseType: 'json'
    });

    const response = this.normalizeResponse({
      providerReference: request.transactionId,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.REFUNDED,
      rawResponse: refund
    });

    this.observeLatency('refund', startedAt);
    return response;
  }

  async void(_: VoidRequest): Promise<PaymentResponse> {
    throw new Error('PAYFLEX void is not supported by the documented integration');
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!signature) {
      return true;
    }

    return super.verifyWebhookSignature(payload, signature);
  }

  async handleWebhook(payload: unknown): Promise<WebhookEvent | null> {
    if (typeof payload !== 'string') {
      return null;
    }

    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (typeof parsed.orderId !== 'string' || typeof parsed.merchantReference !== 'string') {
      return null;
    }

    return toPayFlexWebhookEvent({
      ...parsed,
      orderId: parsed.orderId,
      merchantReference: parsed.merchantReference,
      orderStatus: typeof parsed.orderStatus === 'string' ? parsed.orderStatus : undefined,
      amount: typeof parsed.amount === 'number' ? parsed.amount : undefined
    });
  }
}
