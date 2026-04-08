import { env } from '../../config/env';
import { PaymentStatus } from '../../domain/enums';
import { requestWithRetry } from '../../infrastructure/http.client';
import { logger } from '../../infrastructure/logger';
import { mapTransactionState } from './payu.get-transaction';
import { escapeXml, readTag } from './payu.xml';

interface DoTransactionInput {
  baseUrl: string;
  transactionId: string;
  amount: number;
  currency: string;
  merchantReference: string;
  notificationUrl?: string;
  customer?: {
    merchantUserId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    mobile?: string;
    countryCode?: string;
    countryOfResidence?: string;
    regionalId?: string;
    ip?: string;
  };
  creditCard?: {
    cardExpiry?: string;
    cardNumber?: string;
    cvv?: string;
    nameOnCard?: string;
  };
  secure3d?: boolean;
}

interface DoTransactionResult {
  providerReference: string;
  status: PaymentStatus;
  rawResponse: unknown;
}

const previewSoap = (xml: string, max = 1500): string => {
  const compact = xml.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max)}...`;
};

const readTagMultiline = (xml: string, tagName: string): string | undefined => {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1]?.trim();
};

const stripCdata = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const cdataMatch = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return cdataMatch?.[1] ?? value;
};

const parseAmount = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const extractBlock = (xml: string, tagName: string): string | undefined => {
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1];
};

const xmlTag = (tagName: string, value: string | undefined): string => {
  if (!value || value.trim().length === 0) {
    return '';
  }

  return `\n        <${tagName}>${escapeXml(value)}</${tagName}>`;
};

const normalizeCardExpiry = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const digits = value.replace(/\D/g, '');
  if (digits.length === 4) {
    return `${digits.slice(0, 2)}20${digits.slice(2)}`;
  }
  if (digits.length === 6) {
    return digits;
  }

  return value.trim();
};

const resolveDoTransactionStatus = (
  responseTransactionState: string | undefined,
  responseTransactionType: string,
  successful: boolean,
  resultCode: string,
  fallbackStatus: PaymentStatus,
  is3DSPending: boolean
): PaymentStatus => {
  if (is3DSPending) {
    return PaymentStatus.PENDING_3DS;
  }

  const normalizedResultCode = resultCode.trim().toUpperCase();
  const transactionState = responseTransactionState?.trim();

  if (transactionState && transactionState.length > 0) {
    if (!successful && normalizedResultCode !== '00') {
      return PaymentStatus.FAILED;
    }

    return mapTransactionState(transactionState, responseTransactionType);
  }

  if (successful && normalizedResultCode === '00') {
    return fallbackStatus;
  }

  return PaymentStatus.FAILED;
};

const executeDoTransaction = async (
  input: DoTransactionInput,
  transactionType: 'FINALIZE' | 'RESERVE' | 'CREDIT' | 'RESERVE_CANCEL',
  simulatedStatus: PaymentStatus
): Promise<DoTransactionResult> => {
  const hasSoapCredentials = Boolean(env.payu.soapUsername && env.payu.soapPassword && env.payu.safekey);
  const shouldCallSoap = hasSoapCredentials && env.nodeEnv !== 'test';

  if (!shouldCallSoap) {
    return {
      providerReference: input.transactionId,
      status: simulatedStatus,
      rawResponse: { simulated: true, endpoint: `${input.baseUrl}/doTransaction`, transactionType }
    };
  }

  const amountInCents = Math.round(input.amount * 100);
  const notificationUrl = input.notificationUrl ?? env.payu.defaultNotificationUrl;
  const shouldIncludePayUReference = transactionType !== 'RESERVE';
  const secure3dRequested = input.secure3d === true;
  const shouldIncludeBasketDescription = transactionType === 'RESERVE' || transactionType === 'FINALIZE';

  const normalizedCardExpiry = normalizeCardExpiry(input.creditCard?.cardExpiry);
  const cardNumber = input.creditCard?.cardNumber;
  const cvv = input.creditCard?.cvv;
  const nameOnCard = input.creditCard?.nameOnCard;

  if (transactionType === 'RESERVE') {
    const missingCreditCardFields = [
      { key: 'cardNumber', value: cardNumber },
      { key: 'cardExpiry', value: normalizedCardExpiry },
      { key: 'cvv', value: cvv },
      { key: 'nameOnCard', value: nameOnCard }
    ]
      .filter((field) => !field.value || field.value.trim().length === 0)
      .map((field) => field.key);

    if (missingCreditCardFields.length > 0) {
      throw new Error(`PayU doTransaction RESERVE requires creditCard fields: ${missingCreditCardFields.join(', ')}`);
    }
  }

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
    <ns1:doTransaction>
      <Api>ONE_ZERO</Api>
      <Safekey>${escapeXml(env.payu.safekey)}</Safekey>
      <TransactionType>${transactionType}</TransactionType>
      <AdditionalInformation>
        <merchantReference>${escapeXml(input.merchantReference)}</merchantReference>
        ${shouldIncludePayUReference ? `<payUReference>${escapeXml(input.transactionId)}</payUReference>` : ''}
        ${xmlTag('notificationUrl', notificationUrl)}
        ${secure3dRequested ? '<secure3d>true</secure3d>' : ''}
      </AdditionalInformation>
      <Customer>
        <merchantUserId>${escapeXml(input.customer?.merchantUserId ?? input.merchantReference)}</merchantUserId>
        ${xmlTag('email', input.customer?.email)}
        ${xmlTag('firstName', input.customer?.firstName)}
        ${xmlTag('lastName', input.customer?.lastName)}
        ${xmlTag('mobile', input.customer?.mobile)}
        ${xmlTag('countryCode', input.customer?.countryCode)}
        ${xmlTag('countryOfResidence', input.customer?.countryOfResidence)}
        ${xmlTag('regionalId', input.customer?.regionalId)}
        ${xmlTag('ip', input.customer?.ip)}
      </Customer>
      <Basket>
        <amountInCents>${amountInCents}</amountInCents>
        <currencyCode>${escapeXml(input.currency)}</currencyCode>
        ${shouldIncludeBasketDescription ? `<description>${escapeXml(`Payment ${input.merchantReference}`)}</description>` : ''}
      </Basket>
      <Creditcard>
        <amountInCents>${amountInCents}</amountInCents>
        ${xmlTag('cardExpiry', normalizedCardExpiry)}
        ${xmlTag('cardNumber', cardNumber)}
        ${xmlTag('cvv', cvv)}
        ${xmlTag('nameOnCard', nameOnCard)}
      </Creditcard>
    </ns1:doTransaction>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  const soapResponse = await requestWithRetry<string>({
    method: 'POST',
    url: input.baseUrl,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'doTransaction'
    },
    data: payload,
    responseType: 'text'
  });

  const successful = (readTag(soapResponse, 'successful') ?? '').toLowerCase() === 'true';
  const resultCode = readTag(soapResponse, 'resultCode') ?? '';
  const resultMessage = readTag(soapResponse, 'resultMessage') ?? '';
  const displayMessage = readTag(soapResponse, 'displayMessage') ?? '';
  const pointOfFailure = readTag(soapResponse, 'pointOfFailure') ?? '';
  const faultCode = readTag(soapResponse, 'faultcode') ?? '';
  const faultString = readTag(soapResponse, 'faultstring') ?? '';
  const currentProviderReference = readTag(soapResponse, 'currentPayUReference') ?? '';
  const requestTrace = readTag(soapResponse, 'requestTrace') ?? '';
  const responseTransactionState = readTag(soapResponse, 'transactionState') ?? readTag(soapResponse, 'TransactionState') ?? '';
  const responseTransactionType = readTag(soapResponse, 'transactionType') ?? readTag(soapResponse, 'TransactionType') ?? transactionType;
  const providerReference = currentProviderReference || readTag(soapResponse, 'payUReference') || input.transactionId;
  const merchantReference = readTag(soapResponse, 'merchantReference') ?? input.merchantReference;
  const paymentMethodBlock = extractBlock(soapResponse, 'paymentMethodsUsed');
  const gatewayReference = readTag(paymentMethodBlock ?? '', 'gatewayReference') ?? '';
  const cardInformation = readTag(paymentMethodBlock ?? '', 'information') ?? '';
  const maskedCardNumber = readTag(paymentMethodBlock ?? '', 'cardNumber') ?? '';
  const maskedCardExpiry = readTag(paymentMethodBlock ?? '', 'cardExpiry') ?? '';
  const maskedNameOnCard = readTag(paymentMethodBlock ?? '', 'nameOnCard') ?? '';
  const paymentMethodAmountInCents = parseAmount(readTag(paymentMethodBlock ?? '', 'amountInCents'));
  const paymentMethodTypeMatch = soapResponse.match(/<paymentMethodsUsed[^>]*xsi:type=\"([^\"]+)\"[^>]*>/i);
  const paymentMethodType = paymentMethodTypeMatch?.[1] ?? '';
  const secure3DId = readTag(soapResponse, 'secure3DId') ?? '';
  const secure3DUrl = stripCdata(readTagMultiline(soapResponse, 'secure3DUrl')) ?? '';
  const hasSecure3D = secure3DId.length > 0 || secure3DUrl.length > 0 || resultCode === 'P3DS';
  const is3DSPending = successful && resultCode === 'P3DS';

  logger.info('PayU doTransaction SOAP response', {
    transactionType,
    responseTransactionType,
    responseTransactionState,
    merchantReference: input.merchantReference,
    payuReference: providerReference,
    currentPayuReference: currentProviderReference,
    requestTrace,
    successful,
    resultCode,
    resultMessage,
    is3DSPending,
    faultCode,
    faultString,
    soapPreview: previewSoap(soapResponse)
  });

  return {
    providerReference,
    status: resolveDoTransactionStatus(
      responseTransactionState,
      responseTransactionType,
      successful,
      resultCode,
      simulatedStatus,
      is3DSPending
    ),
    rawResponse: {
      endpoint: `${input.baseUrl}/doTransaction`,
      transactionType,
      transactionState: responseTransactionState,
      resolvedTransactionType: responseTransactionType,
      result: {
        successful,
        resultCode,
        resultMessage,
        displayMessage,
        pointOfFailure,
        requestTrace,
        merchantReference,
        payuReference: readTag(soapResponse, 'payUReference') ?? input.transactionId,
        currentPayuReference: currentProviderReference || undefined,
        effectivePayuReference: providerReference
      },
      paymentMethodUsed: {
        type: paymentMethodType,
        amountInCents: paymentMethodAmountInCents,
        gatewayReference,
        information: cardInformation,
        maskedCardNumber,
        maskedCardExpiry,
        maskedNameOnCard
      },
      secure3D: {
        enabled: hasSecure3D,
        requested: secure3dRequested,
        pending: is3DSPending,
        id: secure3DId,
        url: secure3DUrl
      },
      fault: {
        faultCode,
        faultString
      },
      soapResponse
    }
  };
};

export const runFinalizeDoTransaction = async (input: DoTransactionInput): Promise<DoTransactionResult> =>
  executeDoTransaction(input, 'FINALIZE', PaymentStatus.CAPTURED);

export const runReserveDoTransaction = async (input: DoTransactionInput): Promise<DoTransactionResult> =>
  executeDoTransaction(input, 'RESERVE', PaymentStatus.AUTHORIZED);

export const runCreditDoTransaction = async (input: DoTransactionInput): Promise<DoTransactionResult> =>
  executeDoTransaction(input, 'CREDIT', PaymentStatus.REFUNDED);

export const runReserveCancelDoTransaction = async (input: DoTransactionInput): Promise<DoTransactionResult> =>
  executeDoTransaction(input, 'RESERVE_CANCEL', PaymentStatus.VOIDED);
