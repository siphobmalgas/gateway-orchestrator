import { env } from '../../config/env';
import { PaymentProviderName, PaymentStatus, PayURedirectPaymentMethod, PayUSetTransactionType } from '../../domain/enums';
import { AuthorizeRequest, CaptureRequest, LookupTransactionRequest, LookupTransactionResult, PaymentRequest, PaymentResponse, RefundRequest, VoidRequest, WebhookEvent } from '../../domain/provider.interface';
import { BaseProvider } from '../shared/base.provider';
import { PayURuntimeConfig } from '../provider-runtime-config';
import { runCreditDoTransaction, runFinalizeDoTransaction, runReserveCancelDoTransaction, runReserveDoTransaction } from './payu.do-transaction';
import { getTransaction } from './payu.get-transaction';
import { runPayuPaymentFlow, runPayuReserveFlow } from './payu.payment-flow';
import { hasPayuResponseHash, parsePayuWebhook } from './payu.webhook';

const DEFAULT_PAYU_METHOD: PayURedirectPaymentMethod = 'CREDITCARD';

const readMetadataString = (metadata: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = metadata?.[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readMetadataBoolean = (metadata: Record<string, unknown> | undefined, key: string): boolean => {
  const value = metadata?.[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
};

const shouldUseReserveDoTransaction = (request: AuthorizeRequest): boolean => {
  return request.flowType === 'SERVER_TO_SERVER';
};

export class PayUProvider extends BaseProvider {
  private readonly config: PayURuntimeConfig;

  constructor(config: PayURuntimeConfig = {
    baseUrl: env.payu.baseUrl,
    webhookSecret: env.payu.webhookSecret,
    soapUsername: env.payu.soapUsername,
    soapPassword: env.payu.soapPassword,
    safekey: env.payu.safekey,
    rppRedirectBaseUrl: env.payu.rppRedirectBaseUrl,
    defaultNotificationUrl: env.payu.defaultNotificationUrl
  }) {
    super(PaymentProviderName.PAYU, config.baseUrl, '', config.webhookSecret);
    this.config = config;
  }

  async payment(request: PaymentRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const supportedPaymentMethod = request.paymentMethod ?? DEFAULT_PAYU_METHOD;
    const flow = await runPayuPaymentFlow(this.config, request, supportedPaymentMethod);

    const response = this.normalizeResponse({
      providerReference: flow.providerReference,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.PENDING,
      rawResponse: {
        redirectUrl: flow.redirectUrl,
        supportedPaymentMethod: flow.supportedPaymentMethod,
        transactionType: flow.transactionType,
        endpoint: this.baseUrl
      }
    });

    response.redirectUrl = flow.redirectUrl;
    this.observeLatency('payment', startedAt);
    return response;
  }

  async authorize(request: AuthorizeRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();

    const supportedPaymentMethod = request.paymentMethod ?? DEFAULT_PAYU_METHOD;
    const transactionType: PayUSetTransactionType = request.transactionType ?? 'RESERVE';

    if (shouldUseReserveDoTransaction(request)) {
      const metadata = request.metadata;
      const result = await runReserveDoTransaction({
        config: this.config,
        transactionId: request.paymentId,
        amount: request.amount,
        currency: request.currency,
        merchantReference: request.customerReference ?? request.paymentId,
        returnUrl: request.redirectContext?.returnUrl,
        cancelUrl: request.redirectContext?.cancelUrl,
        notificationUrl: request.redirectContext?.notificationUrl,
        customer: {
          merchantUserId: request.customerReference ?? request.paymentId,
          email: readMetadataString(metadata, 'email'),
          firstName: readMetadataString(metadata, 'firstName'),
          lastName: readMetadataString(metadata, 'lastName'),
          mobile: readMetadataString(metadata, 'mobile'),
          countryCode: readMetadataString(metadata, 'countryCode'),
          countryOfResidence: readMetadataString(metadata, 'countryOfResidence'),
          regionalId: readMetadataString(metadata, 'regionalId'),
          ip: readMetadataString(metadata, 'ip')
        },
        creditCard: {
          cardNumber: readMetadataString(metadata, 'cardNumber'),
          cardExpiry: readMetadataString(metadata, 'cardExpiry'),
          cvv: readMetadataString(metadata, 'cvv'),
          nameOnCard: readMetadataString(metadata, 'nameOnCard')
        },
        secure3d: readMetadataBoolean(metadata, 'secure3d')
      });

      const resultRaw = (result.rawResponse ?? {}) as Record<string, unknown>;
      const secure3D = (resultRaw.secure3D ?? {}) as Record<string, unknown>;
      const secure3DUrl = typeof secure3D.url === 'string' && secure3D.url.length > 0 ? secure3D.url : undefined;

      const response = this.normalizeResponse({
        providerReference: result.providerReference,
        amount: request.amount,
        currency: request.currency,
        status: result.status,
        rawResponse: {
          ...((result.rawResponse ?? {}) as Record<string, unknown>),
          supportedPaymentMethod,
          transactionType,
          flowType: 'SERVER_TO_SERVER',
          endpoint: this.baseUrl
        }
      });

      if ((result.status === PaymentStatus.PENDING || result.status === PaymentStatus.PENDING_3DS) && secure3DUrl) {
        response.redirectUrl = secure3DUrl;
      }

      this.observeLatency('authorize', startedAt);
      return response;
    }

    const flow = await runPayuReserveFlow(this.config, request, supportedPaymentMethod, transactionType);

    const response = this.normalizeResponse({
      providerReference: flow.providerReference,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.PENDING,
      rawResponse: {
        redirectUrl: flow.redirectUrl,
        supportedPaymentMethod: flow.supportedPaymentMethod,
        payuReference: flow.providerReference,
        transactionType: flow.transactionType,
        flowType: 'REDIRECT',
        endpoint: this.baseUrl
      }
    });

    response.redirectUrl = flow.redirectUrl;
    this.observeLatency('authorize', startedAt);
    return response;
  }

  async capture(request: CaptureRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const merchantReference = request.merchantReference ?? request.transactionId;
    const result = await runFinalizeDoTransaction({
      config: this.config,
      transactionId: request.transactionId,
      amount: request.amount,
      currency: request.currency,
      merchantReference
    });

    const response = this.normalizeResponse({
      providerReference: result.providerReference,
      amount: request.amount,
      currency: request.currency,
      status: result.status,
      rawResponse: result.rawResponse
    });

    this.observeLatency('capture', startedAt);
    return response;
  }

  async refund(request: RefundRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const result = await runCreditDoTransaction({
      config: this.config,
      transactionId: request.transactionId,
      amount: request.amount,
      currency: request.currency,
      merchantReference: request.merchantReference ?? request.transactionId
    });

    const response = this.normalizeResponse({
      providerReference: result.providerReference,
      amount: request.amount,
      currency: request.currency,
      status: result.status,
      rawResponse: result.rawResponse
    });

    this.observeLatency('refund', startedAt);
    return response;
  }

  async void(request: VoidRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const merchantReference = request.merchantReference ?? request.transactionId;
    const result = await runReserveCancelDoTransaction({
      config: this.config,
      transactionId: request.transactionId,
      amount: request.amount,
      currency: request.currency,
      merchantReference
    });

    const response = this.normalizeResponse({
      providerReference: result.providerReference,
      amount: request.amount,
      currency: request.currency,
      status: result.status,
      rawResponse: result.rawResponse
    });

    this.observeLatency('void', startedAt);
    return response;
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (signature) {
      return super.verifyWebhookSignature(payload, signature);
    }
    return hasPayuResponseHash(payload);
  }

  async handleWebhook(payload: unknown): Promise<WebhookEvent | null> {
    return parsePayuWebhook(payload);
  }

  async lookupTransaction(request: LookupTransactionRequest): Promise<LookupTransactionResult> {
    return getTransaction({ config: this.config, ...request });
  }
}
