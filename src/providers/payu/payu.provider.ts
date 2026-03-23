import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { PaymentProviderName, PaymentStatus, PayURedirectPaymentMethod, PayUSetTransactionType } from '../../domain/enums';
import { AuthorizeRequest, CaptureRequest, PaymentRequest, PaymentResponse, RefundRequest, WebhookEvent } from '../../domain/provider.interface';
import { requestWithRetry } from '../../infrastructure/http.client';
import { logger } from '../../infrastructure/logger';
import { BaseProvider } from '../shared/base.provider';

const PAYU_METHOD_MAP = {
  CARD: 'CREDITCARD',
  CREDITCARD: 'CREDITCARD',
  EFT: 'EFT',
  EFT_PRO: 'EFT_PRO',
  MOBICRED: 'MOBICRED'
} as const satisfies Record<PayURedirectPaymentMethod, string>;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const readTag = (xml: string, tagName: string): string | undefined => {
  const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1];
};

const resolveExternalCallbackUrl = (urlValue: string): string => {
  if (!env.publicBaseUrl) {
    return urlValue;
  }

  try {
    const callbackUrl = new URL(urlValue);
    const isLocalHost = callbackUrl.hostname === 'localhost' || callbackUrl.hostname === '127.0.0.1';
    if (!isLocalHost) {
      return urlValue;
    }

    const externalBase = new URL(env.publicBaseUrl);
    const rewrittenUrl = new URL(externalBase.toString());
    rewrittenUrl.pathname = callbackUrl.pathname;
    rewrittenUrl.search = callbackUrl.search;
    rewrittenUrl.hash = callbackUrl.hash;
    return rewrittenUrl.toString();
  } catch {
    return urlValue;
  }
};

const isLocalCallbackUrl = (urlValue: string): boolean => {
  try {
    const callbackUrl = new URL(urlValue);
    return callbackUrl.hostname === 'localhost' || callbackUrl.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

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

export class PayUProvider extends BaseProvider {
  private readonly processedIpnHashes = new Set<string>();

  constructor() {
    super(PaymentProviderName.PAYU, env.payu.baseUrl, '', env.payu.webhookSecret);
  }

  async payment(request: PaymentRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();

    const selectedMethod: PayURedirectPaymentMethod = request.paymentMethod ?? 'CREDITCARD';
    const supportedPaymentMethod = PAYU_METHOD_MAP[selectedMethod];
    const transactionType: PayUSetTransactionType = 'PAYMENT';

    const payuReference = await this.createSetTransaction(request, supportedPaymentMethod, transactionType);
    const redirectUrl = `${env.payu.rppRedirectBaseUrl}?PayUReference=${encodeURIComponent(payuReference)}`;

    const response = this.normalizeResponse({
      providerReference: payuReference,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.PENDING,
      rawResponse: {
        redirectUrl,
        supportedPaymentMethod,
        transactionType,
        endpoint: this.baseUrl
      }
    });

    response.redirectUrl = redirectUrl;
    this.observeLatency('payment', startedAt);
    return response;
  }

  async authorize(request: AuthorizeRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();

    const selectedMethod: PayURedirectPaymentMethod = request.paymentMethod ?? 'CREDITCARD';
    const supportedPaymentMethod = PAYU_METHOD_MAP[selectedMethod];
    const transactionType: PayUSetTransactionType = request.transactionType ?? 'RESERVE';

    const payuReference = await this.createSetTransaction(request, supportedPaymentMethod, transactionType);
    const redirectUrl = `${env.payu.rppRedirectBaseUrl}?PayUReference=${encodeURIComponent(payuReference)}`;

    const response = this.normalizeResponse({
      providerReference: payuReference,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.PENDING,
      rawResponse: {
        redirectUrl,
        supportedPaymentMethod,
        payuReference,
        transactionType,
        endpoint: this.baseUrl
      }
    });

    response.redirectUrl = redirectUrl;
    this.observeLatency('authorize', startedAt);
    return response;
  }

  async capture(request: CaptureRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();

    const hasSoapCredentials = Boolean(env.payu.soapUsername && env.payu.soapPassword && env.payu.safekey);
    const shouldCallSoap = hasSoapCredentials && env.nodeEnv !== 'test';
    if (!shouldCallSoap) {
      const response = this.normalizeResponse({
        providerReference: request.transactionId,
        amount: request.amount,
        currency: request.currency,
        status: PaymentStatus.CAPTURED,
        rawResponse: { simulated: true, endpoint: `${this.baseUrl}/doTransaction` }
      });
      this.observeLatency('capture', startedAt);
      return response;
    }

    const amountInCents = Math.round(request.amount * 100);
    const merchantReference = request.merchantReference ?? request.transactionId;

    const payload = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://soap.api.controller.web.payjar.com/" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <SOAP-ENV:Header>
    <wsse:Security SOAP-ENV:mustUnderstand="1">
      <wsse:UsernameToken>
        <wsse:Username>${escapeXml(env.payu.soapUsername)}</wsse:Username>
        <wsse:Password>${escapeXml(env.payu.soapPassword)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </SOAP-ENV:Header>
  <SOAP-ENV:Body>
    <ns1:doTransaction>
      <Api>ONE_ZERO</Api>
      <Safekey>${escapeXml(env.payu.safekey)}</Safekey>
      <TransactionType>FINALIZE</TransactionType>
      <AdditionalInformation>
        <merchantReference>${escapeXml(merchantReference)}</merchantReference>
        <payUReference>${escapeXml(request.transactionId)}</payUReference>
      </AdditionalInformation>
      <Basket>
        <amountInCents>${amountInCents}</amountInCents>
        <currencyCode>${escapeXml(request.currency)}</currencyCode>
      </Basket>
      <Creditcard>
        <amountInCents>${amountInCents}</amountInCents>
      </Creditcard>
    </ns1:doTransaction>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

    const soapResponse = await requestWithRetry<string>({
      method: 'POST',
      url: this.baseUrl,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'doTransaction'
      },
      data: payload,
      responseType: 'text'
    });

    const successful = (readTag(soapResponse, 'successful') ?? '').toLowerCase() === 'true';
    const resultCode = readTag(soapResponse, 'resultCode') ?? '';
    const providerReference = readTag(soapResponse, 'payUReference') ?? request.transactionId;

    const response = this.normalizeResponse({
      providerReference,
      amount: request.amount,
      currency: request.currency,
      status: successful && resultCode === '00' ? PaymentStatus.CAPTURED : PaymentStatus.FAILED,
      rawResponse: { soapResponse, endpoint: `${this.baseUrl}/doTransaction` }
    });

    this.observeLatency('capture', startedAt);
    return response;
  }

  async refund(request: RefundRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const response = this.normalizeResponse({
      providerReference: request.transactionId,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.REFUNDED,
      rawResponse: { simulated: true, endpoint: `${this.baseUrl}/refund` }
    });
    this.observeLatency('refund', startedAt);
    return response;
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (signature) {
      return super.verifyWebhookSignature(payload, signature);
    }
    return Boolean(readTag(payload, 'ResponseHash') || readTag(payload, 'responseHash'));
  }

  async handleWebhook(payload: unknown): Promise<WebhookEvent | null> {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);

    const merchantReference = readTag(raw, 'MerchantReference') ?? readTag(raw, 'merchantReference');
    const payUReference = readTag(raw, 'PayUReference') ?? readTag(raw, 'payUReference');
    const transactionState = readTag(raw, 'TransactionState') ?? readTag(raw, 'transactionState');
    const transactionType = readTag(raw, 'TransactionType') ?? readTag(raw, 'transactionType') ?? 'PAYMENT';
    const resultCode = readTag(raw, 'ResultCode') ?? readTag(raw, 'resultCode');
    const successful = readTag(raw, 'Successful') ?? readTag(raw, 'successful');
    const responseHash = readTag(raw, 'ResponseHash') ?? readTag(raw, 'responseHash');

    if (responseHash && this.processedIpnHashes.has(responseHash)) {
      return null;
    }

    if (!merchantReference || !payUReference || !transactionState) {
      return null;
    }

    if (responseHash) {
      this.processedIpnHashes.add(responseHash);
    }

    return {
      merchantReference,
      providerReference: payUReference,
      status: mapIpnStatus(transactionState, transactionType, resultCode, successful),
      responseHash,
      rawPayload: payload
    };
  }

  private async createSetTransaction(
    request: PaymentRequest,
    supportedPaymentMethod: string,
    transactionType: PayUSetTransactionType
  ): Promise<string> {
    const hasSoapCredentials = Boolean(env.payu.soapUsername && env.payu.soapPassword && env.payu.safekey);
    const shouldCallSoap = hasSoapCredentials && env.nodeEnv !== 'test';

    if (!shouldCallSoap) {
      return `payu_${randomUUID()}`;
    }

    const amountInCents = Math.round(request.amount * 100);
    const merchantReference = request.paymentId;
    const returnUrl = resolveExternalCallbackUrl(request.redirectContext?.returnUrl ?? env.payu.defaultReturnUrl);
    const cancelUrl = resolveExternalCallbackUrl(request.redirectContext?.cancelUrl ?? env.payu.defaultCancelUrl);
    const notificationUrl = resolveExternalCallbackUrl(request.redirectContext?.notificationUrl ?? env.payu.defaultNotificationUrl);

    if (isLocalCallbackUrl(returnUrl) || isLocalCallbackUrl(cancelUrl) || isLocalCallbackUrl(notificationUrl)) {
      throw new Error('PayU callback URLs cannot use localhost. Set PUBLIC_BASE_URL or explicit public PAYU_*_URL values.');
    }

    logger.info('PayU setTransaction callback URLs', {
      merchantReference,
      returnUrl,
      cancelUrl,
      notificationUrl
    });

    const redirectChannel = request.redirectContext?.redirectChannel ?? 'responsive';

    const payload = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://soap.api.controller.web.payjar.com/" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <SOAP-ENV:Header>
    <wsse:Security SOAP-ENV:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken wsu:Id="UsernameToken-9" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:Username>${escapeXml(env.payu.soapUsername)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escapeXml(env.payu.soapPassword)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </SOAP-ENV:Header>
  <SOAP-ENV:Body>
    <ns1:setTransaction>
      <Api>ONE_ZERO</Api>
      <Safekey>${escapeXml(env.payu.safekey)}</Safekey>
      <TransactionType>${escapeXml(transactionType)}</TransactionType>
      <AdditionalInformation>
        <merchantReference>${escapeXml(merchantReference)}</merchantReference>
        <supportedPaymentMethods>${escapeXml(supportedPaymentMethod)}</supportedPaymentMethods>
        <redirectChannel>${escapeXml(redirectChannel)}</redirectChannel>
        <notificationUrl>${escapeXml(notificationUrl)}</notificationUrl>
        <returnUrl>${escapeXml(returnUrl)}</returnUrl>
        <cancelUrl>${escapeXml(cancelUrl)}</cancelUrl>
      </AdditionalInformation>
      <Customer>
        <merchantUserId>${escapeXml(request.customerReference ?? merchantReference)}</merchantUserId>
      </Customer>
      <Basket>
        <amountInCents>${amountInCents}</amountInCents>
        <currencyCode>${escapeXml(request.currency)}</currencyCode>
        <description>${escapeXml(`Payment ${merchantReference}`)}</description>
      </Basket>
    </ns1:setTransaction>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

    logger.info('PayU setTransaction SOAP request', {
      merchantReference,
      endpoint: this.baseUrl,
      soapAction: 'setTransaction',
      payload
    });

    const soapResponse = await requestWithRetry<string>({
      method: 'POST',
      url: this.baseUrl,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'setTransaction'
      },
      data: payload,
      responseType: 'text'
    });

    const successful = (readTag(soapResponse, 'successful') ?? '').toLowerCase() === 'true';
    const payUReference = readTag(soapResponse, 'payUReference') ?? readTag(soapResponse, 'payureference');
    if (!successful || !payUReference) {
      throw new Error('PayU setTransaction failed for redirect payment');
    }

    return payUReference;
  }
}
