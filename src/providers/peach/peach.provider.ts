import { env } from '../../config/env';
import { PEACH_CARD_BRANDS, PeachPaymentBrand, PaymentProviderName, PaymentStatus } from '../../domain/enums';
import {
  AuthorizeRequest,
  CaptureRequest,
  LookupTransactionRequest,
  LookupTransactionResult,
  PaymentRequest,
  PaymentResponse,
  RefundRequest,
  VoidRequest,
  WebhookEvent
} from '../../domain/provider.interface';
import { BaseProvider } from '../shared/base.provider';
import { capturePeachPayment, reversePeachPayment } from './peach.card-management';
import { createPeachCheckout, generateMerchantTransactionId } from './peach.checkout';
import { processPeachRefund } from './peach.refund';
import { executePeachS2SCardPayment, getPeachS2SPaymentStatus, PeachS2SCardInput } from './peach.s2s-payment';
import { verifyPeachCheckoutSignature } from './peach.signature';
import { queryPeachTransactionStatus } from './peach.status';
import { parsePeachWebhook } from './peach.webhook';

const readMetadataString = (metadata: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};

const hasS2SCardDetails = (metadata?: Record<string, unknown>): boolean => {
  if (!metadata) return false;
  return !!(
    readMetadataString(metadata, 'card.number') &&
    readMetadataString(metadata, 'card.expiryMonth') &&
    readMetadataString(metadata, 'card.expiryYear') &&
    readMetadataString(metadata, 'card.cvv')
  );
};

const buildS2SInput = (
  request: PaymentRequest | AuthorizeRequest,
  paymentType: 'DB' | 'PA',
  paymentBrand: string,
  merchantTransactionId: string
): PeachS2SCardInput => {
  const metadata = request.metadata ?? {};
  const input: PeachS2SCardInput = {
    paymentBrand,
    paymentType,
    amount: request.amount,
    currency: request.currency,
    shopperResultUrl: request.redirectContext?.returnUrl ?? env.peach.defaultShopperResultUrl,
    merchantTransactionId,
    card: {
      number: readMetadataString(metadata, 'card.number')!,
      holder: readMetadataString(metadata, 'card.holder') ?? '',
      expiryMonth: readMetadataString(metadata, 'card.expiryMonth')!,
      expiryYear: readMetadataString(metadata, 'card.expiryYear')!,
      cvv: readMetadataString(metadata, 'card.cvv')!
    }
  };

  const challengeIndicator = readMetadataString(metadata, 'threeDSecure.challengeIndicator');
  const exemptionFlag = readMetadataString(metadata, 'threeDSecure.exemptionFlag');
  if (challengeIndicator || exemptionFlag) {
    input.threeDSecure = { challengeIndicator, exemptionFlag };
  }

  const browserAcceptHeader = readMetadataString(metadata, 'customer.browser.acceptHeader');
  if (browserAcceptHeader) {
    input.browser = {
      acceptHeader: browserAcceptHeader,
      language: readMetadataString(metadata, 'customer.browser.language'),
      screenHeight: readMetadataString(metadata, 'customer.browser.screenHeight'),
      screenWidth: readMetadataString(metadata, 'customer.browser.screenWidth'),
      timezone: readMetadataString(metadata, 'customer.browser.timezone'),
      userAgent: readMetadataString(metadata, 'customer.browser.userAgent'),
      javaEnabled: readMetadataString(metadata, 'customer.browser.javaEnabled'),
      javascriptEnabled: readMetadataString(metadata, 'customer.browser.javascriptEnabled'),
      screenColorDepth: readMetadataString(metadata, 'customer.browser.screenColorDepth'),
      challengeWindow: readMetadataString(metadata, 'customer.browser.challengeWindow')
    };
  }

  input.customerIp = readMetadataString(metadata, 'customer.ip');

  const customParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith('customParameters[') && typeof value === 'string') {
      const paramName = key.replace(/^customParameters\[/, '').replace(/]$/, '');
      customParams[paramName] = value;
    }
  }
  if (Object.keys(customParams).length > 0) {
    input.customParameters = customParams;
  }

  return input;
};

export class PeachProvider extends BaseProvider {
  private readonly merchantTransactionIdMap = new Map<string, string>();

  constructor() {
    super(PaymentProviderName.PEACH, env.peach.checkoutBaseUrl, '', env.peach.webhookSecret);
  }

  async payment(request: PaymentRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const paymentBrand = request.paymentMethod as PeachPaymentBrand | undefined;
    const isCardBrand = paymentBrand && (PEACH_CARD_BRANDS as readonly string[]).includes(paymentBrand);

    if (isCardBrand && hasS2SCardDetails(request.metadata)) {
      return this.executeS2SCardFlow(request, 'DB', paymentBrand, startedAt, 'payment');
    }

    const result = await createPeachCheckout(request, 'DB', paymentBrand);
    this.merchantTransactionIdMap.set(result.merchantTransactionId, request.paymentId);

    const response = this.normalizeResponse({
      providerReference: result.checkoutId,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.PENDING,
      rawResponse: {
        checkoutId: result.checkoutId,
        merchantTransactionId: result.merchantTransactionId,
        redirectUrl: result.redirectUrl,
        paymentType: 'DB',
        endpoint: this.baseUrl
      }
    });

    response.redirectUrl = result.redirectUrl;
    this.observeLatency('payment', startedAt);
    return response;
  }

  async authorize(request: AuthorizeRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const paymentBrand = request.paymentMethod as PeachPaymentBrand | undefined;
    const isCardBrand = paymentBrand && (PEACH_CARD_BRANDS as readonly string[]).includes(paymentBrand);
    const paymentType = isCardBrand ? ('PA' as const) : ('DB' as const);

    if (isCardBrand && hasS2SCardDetails(request.metadata)) {
      return this.executeS2SCardFlow(request, paymentType, paymentBrand, startedAt, 'authorize');
    }

    const result = await createPeachCheckout(request, paymentType, paymentBrand);
    this.merchantTransactionIdMap.set(result.merchantTransactionId, request.paymentId);

    const response = this.normalizeResponse({
      providerReference: result.checkoutId,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.PENDING,
      rawResponse: {
        checkoutId: result.checkoutId,
        merchantTransactionId: result.merchantTransactionId,
        redirectUrl: result.redirectUrl,
        paymentType,
        endpoint: this.baseUrl
      }
    });

    response.redirectUrl = result.redirectUrl;
    this.observeLatency('authorize', startedAt);
    return response;
  }

  async capture(request: CaptureRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();

    const result = await capturePeachPayment({
      uniqueTransactionId: request.transactionId,
      amount: request.amount,
      currency: request.currency
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

    const result = await processPeachRefund({
      uniqueTransactionId: request.transactionId,
      amount: request.amount,
      currency: request.currency
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

    const result = await reversePeachPayment({
      uniqueTransactionId: request.transactionId,
      amount: request.amount,
      currency: request.currency
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
    return verifyPeachCheckoutSignature(payload, env.peach.secretToken);
  }

  async handleWebhook(payload: unknown): Promise<WebhookEvent | null> {
    return parsePeachWebhook(payload, this.merchantTransactionIdMap);
  }

  async lookupTransaction(request: LookupTransactionRequest): Promise<LookupTransactionResult> {
    if (request.providerReference && request.providerReference.length > 16) {
      const s2sResult = await getPeachS2SPaymentStatus(request.providerReference);
      const raw = (s2sResult.rawResponse ?? {}) as Record<string, unknown>;
      return {
        providerReference: s2sResult.providerReference,
        merchantReference: (raw.merchantTransactionId as string) ?? request.merchantReference ?? '',
        transactionState: s2sResult.status,
        transactionType: (raw.paymentType as string) ?? '',
        status: s2sResult.status,
        amountInCents: Math.round(parseFloat((raw.amount as string) ?? '0') * 100),
        currency: (raw.currency as string) ?? '',
        resultCode: ((raw.result as Record<string, unknown>)?.code as string) ?? '',
        resultMessage: ((raw.result as Record<string, unknown>)?.description as string) ?? '',
        rawResponse: s2sResult.rawResponse
      };
    }

    const merchantTransactionId = request.merchantReference
      ? generateMerchantTransactionId(request.merchantReference)
      : (request.providerReference ?? '');

    return queryPeachTransactionStatus(merchantTransactionId);
  }

  private async executeS2SCardFlow(
    request: PaymentRequest | AuthorizeRequest,
    paymentType: 'DB' | 'PA',
    paymentBrand: string,
    startedAt: number,
    operation: string
  ): Promise<PaymentResponse> {
    const merchantTransactionId = generateMerchantTransactionId(request.paymentId);
    this.merchantTransactionIdMap.set(merchantTransactionId, request.paymentId);

    const s2sInput = buildS2SInput(request, paymentType, paymentBrand, merchantTransactionId);
    const result = await executePeachS2SCardPayment(s2sInput);

    const response = this.normalizeResponse({
      providerReference: result.providerReference,
      amount: request.amount,
      currency: request.currency,
      status: result.status,
      rawResponse: {
        ...(result.rawResponse as Record<string, unknown>),
        merchantTransactionId,
        paymentType,
        flowType: 'SERVER_TO_SERVER',
        endpoint: env.peach.cardApiBaseUrl
      }
    });

    if (result.status === PaymentStatus.PENDING_3DS && result.redirectUrl) {
      response.redirectUrl = result.redirectUrl;
    }

    this.observeLatency(operation, startedAt);
    return response;
  }
}
