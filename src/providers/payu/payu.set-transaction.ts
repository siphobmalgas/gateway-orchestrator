import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { PayURedirectPaymentMethod, PayUSetTransactionType } from '../../domain/enums';
import { PaymentRequest } from '../../domain/provider.interface';
import { requestWithRetry } from '../../infrastructure/http.client';
import { logger } from '../../infrastructure/logger';
import { escapeXml, readTag } from './payu.xml';

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

interface SetTransactionInput {
  baseUrl: string;
  request: PaymentRequest;
  paymentMethod: PayURedirectPaymentMethod;
  transactionType: PayUSetTransactionType;
}

const createSetTransaction = async (input: SetTransactionInput): Promise<string> => {
  const hasSoapCredentials = Boolean(env.payu.soapUsername && env.payu.soapPassword && env.payu.safekey);
  const shouldCallSoap = hasSoapCredentials && env.nodeEnv !== 'test';

  if (!shouldCallSoap) {
    return `payu_${randomUUID()}`;
  }

  const amountInCents = Math.round(input.request.amount * 100);
  const merchantReference = input.request.paymentId;
  const returnUrl = resolveExternalCallbackUrl(input.request.redirectContext?.returnUrl ?? env.payu.defaultReturnUrl);
  const cancelUrl = resolveExternalCallbackUrl(input.request.redirectContext?.cancelUrl ?? env.payu.defaultCancelUrl);
  const notificationUrl = resolveExternalCallbackUrl(input.request.redirectContext?.notificationUrl ?? env.payu.defaultNotificationUrl);

  if (isLocalCallbackUrl(returnUrl) || isLocalCallbackUrl(cancelUrl) || isLocalCallbackUrl(notificationUrl)) {
    throw new Error('PayU callback URLs cannot use localhost. Set PUBLIC_BASE_URL or explicit public PAYU_*_URL values.');
  }

  logger.info('PayU setTransaction callback URLs', {
    merchantReference,
    returnUrl,
    cancelUrl,
    notificationUrl
  });

  const redirectChannel = input.request.redirectContext?.redirectChannel ?? 'responsive';
  const metadata = input.request.metadata ?? {};
  const secure3dRequested =
    input.paymentMethod === 'CREDITCARD' &&
    (metadata.secure3d === true || (typeof metadata.secure3d === 'string' && metadata.secure3d.toLowerCase() === 'true'));
  const customerFirstName = typeof metadata.firstName === 'string' ? metadata.firstName : undefined;
  const customerLastName = typeof metadata.lastName === 'string' ? metadata.lastName : undefined;
  const customerMobile = typeof metadata.mobile === 'string' ? metadata.mobile : undefined;
  const customerEmail = typeof metadata.email === 'string' ? metadata.email : undefined;

  const customerFields = [
    customerFirstName ? `\n        <firstName>${escapeXml(customerFirstName)}</firstName>` : '',
    customerLastName ? `\n        <lastName>${escapeXml(customerLastName)}</lastName>` : '',
    customerMobile ? `\n        <mobile>${escapeXml(customerMobile)}</mobile>` : '',
    customerEmail ? `\n        <email>${escapeXml(customerEmail)}</email>` : ''
  ].join('');

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
      <TransactionType>${escapeXml(input.transactionType)}</TransactionType>
      <AdditionalInformation>
        <merchantReference>${escapeXml(merchantReference)}</merchantReference>
        <supportedPaymentMethods>${escapeXml(input.paymentMethod)}</supportedPaymentMethods>
        <redirectChannel>${escapeXml(redirectChannel)}</redirectChannel>
        <notificationUrl>${escapeXml(notificationUrl)}</notificationUrl>
        <returnUrl>${escapeXml(returnUrl)}</returnUrl>
        <cancelUrl>${escapeXml(cancelUrl)}</cancelUrl>
        ${secure3dRequested ? '<secure3d>true</secure3d>' : ''}
      </AdditionalInformation>
      <Customer>
        <merchantUserId>${escapeXml(input.request.customerReference ?? merchantReference)}</merchantUserId>
        ${customerFields}
      </Customer>
      <Basket>
        <amountInCents>${amountInCents}</amountInCents>
        <currencyCode>${escapeXml(input.request.currency)}</currencyCode>
        <description>${escapeXml(`Payment ${merchantReference}`)}</description>
      </Basket>
    </ns1:setTransaction>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  logger.info('PayU setTransaction SOAP request', {
    merchantReference,
    endpoint: input.baseUrl,
    soapAction: 'setTransaction',
    payload
  });

  const soapResponse = await requestWithRetry<string>({
    method: 'POST',
    url: input.baseUrl,
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
    const resultCode = readTag(soapResponse, 'resultCode') ?? 'UNKNOWN';
    const resultMessage = readTag(soapResponse, 'resultMessage') ?? 'No resultMessage returned by PayU';
    throw new Error(`PayU setTransaction failed for redirect payment (resultCode=${resultCode}, resultMessage=${resultMessage})`);
  }

  return payUReference;
};

export const createPaymentSetTransaction = async (baseUrl: string, request: PaymentRequest, paymentMethod: PayURedirectPaymentMethod): Promise<string> =>
  createSetTransaction({
    baseUrl,
    request,
    paymentMethod,
    transactionType: 'PAYMENT'
  });

export const createReserveSetTransaction = async (
  baseUrl: string,
  request: PaymentRequest,
  paymentMethod: PayURedirectPaymentMethod,
  transactionType: PayUSetTransactionType
): Promise<string> =>
  createSetTransaction({
    baseUrl,
    request,
    paymentMethod,
    transactionType
  });
