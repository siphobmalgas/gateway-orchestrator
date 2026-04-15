import { env } from '../../config/env';
import { PaymentStatus } from '../../domain/enums';
import { LookupTransactionRequest, LookupTransactionResult } from '../../domain/provider.interface';
import { requestWithRetry } from '../../infrastructure/http.client';
import { PayURuntimeConfig } from '../provider-runtime-config';
import { escapeXml, readTag } from './payu.xml';

/**
 * Maps a PayU transactionState + transactionType to an internal PaymentStatus.
 *
 * PayU transaction states (from docs):
 *   NEW              – setTransaction completed; payment page rendered but not submitted
 *   PROCESSING       – user redirected or doTransaction FINALIZE in flight
 *   SUCCESSFUL       – payment was successful (terminal)
 *   FAILED           – payment was not successful (terminal)
 *   TIMEOUT          – payment timed out during processing
 *   EXPIRED          – transaction created but never attempted
 *   AWAITING_PAYMENT – EFT pending confirmation (not yet SUCCESSFUL or FAILED)
 */
export const mapTransactionState = (transactionState: string, transactionType: string): PaymentStatus => {
  const state = transactionState.trim().toUpperCase();
  const type = transactionType.trim().toUpperCase();

  switch (state) {
    case 'SUCCESSFUL':
      if (type === 'RESERVE') {
        return PaymentStatus.AUTHORIZED;
      }
      if (type === 'FINALIZE' || type === 'PAYMENT') {
        return PaymentStatus.CAPTURED;
      }
      if (type === 'CREDIT') {
        return PaymentStatus.REFUNDED;
      }
      if (type === 'RESERVE_CANCEL') {
        return PaymentStatus.VOIDED;
      }
      return PaymentStatus.CAPTURED;
    case 'NEW':
    case 'PROCESSING':
    case 'AWAITING_PAYMENT':
      return PaymentStatus.PENDING;
    case '3DS_PENDING':
      return PaymentStatus.PENDING_3DS;
    case 'FAILED':
    case 'TIMEOUT':
    case 'EXPIRED':
      return PaymentStatus.FAILED;
    default:
      return PaymentStatus.UNKNOWN;
  }
};

export type GetTransactionInput = LookupTransactionRequest & { config: PayURuntimeConfig };

export const getTransaction = async (input: GetTransactionInput): Promise<LookupTransactionResult> => {
  const hasSoapCredentials = Boolean(input.config.soapUsername && input.config.soapPassword && input.config.safekey);
  const shouldCallSoap = hasSoapCredentials && env.nodeEnv !== 'test';

  if (!shouldCallSoap) {
    const ref = input.payuReference ?? input.providerReference ?? '';
    return {
      providerReference: ref,
      payuReference: ref,
      merchantReference: input.merchantReference ?? ref,
      transactionState: 'SUCCESSFUL',
      transactionType: 'RESERVE',
      status: PaymentStatus.AUTHORIZED,
      amountInCents: 0,
      currency: 'ZAR',
      resultCode: '00',
      resultMessage: 'Simulated lookup',
      rawResponse: { simulated: true, endpoint: `${input.config.baseUrl}/getTransaction` }
    };
  }

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
    <ns1:getTransaction>
      <Api>ONE_ZERO</Api>
      <Safekey>${escapeXml(input.config.safekey)}</Safekey>
      <AdditionalInformation>
        <payUReference>${escapeXml(input.payuReference ?? input.providerReference ?? '')}</payUReference>
      </AdditionalInformation>
    </ns1:getTransaction>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  const soapResponse = await requestWithRetry<string>({
    method: 'POST',
    url: input.config.baseUrl,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'getTransaction'
    },
    data: payload,
    responseType: 'text'
  });

  const transactionState = readTag(soapResponse, 'transactionState') ?? 'FAILED';
  const transactionType = readTag(soapResponse, 'transactionType') ?? '';
  const currentPayuReference = readTag(soapResponse, 'currentPayUReference') ?? '';
  const payuReference = currentPayuReference || readTag(soapResponse, 'payUReference') || input.payuReference || input.providerReference || '';
  const merchantReference = readTag(soapResponse, 'merchantReference') ?? input.merchantReference ?? input.payuReference ?? input.providerReference ?? '';
  const resultCode = readTag(soapResponse, 'resultCode') ?? '';
  const resultMessage = readTag(soapResponse, 'resultMessage') ?? '';
  const requestTrace = readTag(soapResponse, 'requestTrace') ?? '';
  const amountInCents = parseInt(readTag(soapResponse, 'amountInCents') ?? '0', 10);
  const currency = readTag(soapResponse, 'currencyCode') ?? 'ZAR';

  return {
    payuReference,
    merchantReference,
    transactionState,
    transactionType,
    status: mapTransactionState(transactionState, transactionType),
    amountInCents,
    currency,
    resultCode,
    resultMessage,
    rawResponse: {
      soapResponse,
      endpoint: `${input.config.baseUrl}/getTransaction`,
      requestTrace,
      currentPayUReference: currentPayuReference || undefined
    }
  };
};
