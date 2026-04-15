import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { PayURedirectPaymentMethod, PayUSetTransactionType } from '../../domain/enums';
import { PaymentRequest } from '../../domain/provider.interface';
import { requestWithRetry } from '../../infrastructure/http.client';
import { logger } from '../../infrastructure/logger';
import { PayURuntimeConfig } from '../provider-runtime-config';
import { assertPublicCallbackUrls, requireMerchantRedirectUrl, resolveExternalCallbackUrl } from './payu.callback-urls';
import { escapeXml, readTag } from './payu.xml';

interface SetTransactionInput {
  config: PayURuntimeConfig;
  request: PaymentRequest;
  paymentMethod: PayURedirectPaymentMethod;
  transactionType: PayUSetTransactionType;
}

const createSetTransaction = async (input: SetTransactionInput): Promise<string> => {
  const amountInCents = Math.round(input.request.amount * 100);
  const merchantReference = input.request.paymentId;
  const returnUrl = requireMerchantRedirectUrl(input.request.redirectContext?.returnUrl, 'returnUrl', 'redirect payments');
  const cancelUrl = requireMerchantRedirectUrl(input.request.redirectContext?.cancelUrl, 'cancelUrl', 'redirect payments');
  const notificationUrl = resolveExternalCallbackUrl(input.request.redirectContext?.notificationUrl ?? input.config.defaultNotificationUrl);

  assertPublicCallbackUrls([returnUrl, cancelUrl, notificationUrl]);

  logger.info('PayU setTransaction callback URLs', {
    merchantReference,
    returnUrl,
    cancelUrl,
    notificationUrl
  });

  const hasSoapCredentials = Boolean(input.config.soapUsername && input.config.soapPassword && input.config.safekey);
  const shouldCallSoap = hasSoapCredentials && env.nodeEnv !== 'test';

  if (!shouldCallSoap) {
    return `payu_${randomUUID()}`;
  }

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
        <wsse:Username>${escapeXml(input.config.soapUsername)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${escapeXml(input.config.soapPassword)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </SOAP-ENV:Header>
  <SOAP-ENV:Body>
    <ns1:setTransaction>
      <Api>ONE_ZERO</Api>
      <Safekey>${escapeXml(input.config.safekey)}</Safekey>
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
    endpoint: input.config.baseUrl,
    soapAction: 'setTransaction',
    payload
  });

  const soapResponse = await requestWithRetry<string>({
    method: 'POST',
    url: input.config.baseUrl,
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

export const createPaymentSetTransaction = async (config: PayURuntimeConfig, request: PaymentRequest, paymentMethod: PayURedirectPaymentMethod): Promise<string> =>
  createSetTransaction({
    config,
    request,
    paymentMethod,
    transactionType: 'PAYMENT'
  });

export const createReserveSetTransaction = async (
  config: PayURuntimeConfig,
  request: PaymentRequest,
  paymentMethod: PayURedirectPaymentMethod,
  transactionType: PayUSetTransactionType
): Promise<string> =>
  createSetTransaction({
    config,
    request,
    paymentMethod,
    transactionType
  });
