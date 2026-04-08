import { env } from '../../config/env';
import { PaymentStatus } from '../../domain/enums';
import { LookupTransactionRequest, LookupTransactionResult } from '../../domain/provider.interface';
import { requestWithRetry } from '../../infrastructure/http.client';
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
const mapTransactionState = (transactionState: string, transactionType: string): PaymentStatus => {
  const state = transactionState.toUpperCase();
  const type = transactionType.toUpperCase();

  switch (state) {
    case 'SUCCESSFUL': {
      switch (type) {
        case 'RESERVE':
          return PaymentStatus.AUTHORIZED;
        case 'FINALIZE':
        case 'PAYMENT':
          return PaymentStatus.CAPTURED;
        case 'CREDIT':
          return PaymentStatus.REFUNDED;
        case 'RESERVE_CANCEL':
          return PaymentStatus.RESERVE_CANCEL;
        default:
          return PaymentStatus.CAPTURED;
      }
    }
    case 'NEW':
    case 'PROCESSING':
    case 'AWAITING_PAYMENT':
      return PaymentStatus.PENDING;
    case 'FAILED':
    case 'TIMEOUT':
    case 'EXPIRED':
    default:
      return PaymentStatus.FAILED;
  }
};

export type GetTransactionInput = LookupTransactionRequest & { baseUrl: string };

export const getTransaction = async (input: GetTransactionInput): Promise<LookupTransactionResult> => {
  const hasSoapCredentials = Boolean(env.payu.soapUsername && env.payu.soapPassword && env.payu.safekey);
  const shouldCallSoap = hasSoapCredentials && env.nodeEnv !== 'test';

  if (!shouldCallSoap) {
    return {
      payuReference: input.payuReference,
      merchantReference: input.merchantReference ?? input.payuReference,
      transactionState: 'SUCCESSFUL',
      transactionType: 'RESERVE',
      status: PaymentStatus.AUTHORIZED,
      amountInCents: 0,
      currency: 'ZAR',
      resultCode: '00',
      resultMessage: 'Simulated lookup',
      rawResponse: { simulated: true, endpoint: `${input.baseUrl}/getTransaction` }
    };
  }

  const merchantRefXml = input.merchantReference
    ? `\n        <merchantReference>${escapeXml(input.merchantReference)}</merchantReference>`
    : '';

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
    <ns1:getTransaction>
      <Api>ONE_ZERO</Api>
      <Safekey>${escapeXml(env.payu.safekey)}</Safekey>
      <AdditionalInformation>
        <payUReference>${escapeXml(input.payuReference)}</payUReference>${merchantRefXml}
      </AdditionalInformation>
    </ns1:getTransaction>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  const soapResponse = await requestWithRetry<string>({
    method: 'POST',
    url: input.baseUrl,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'getTransaction'
    },
    data: payload,
    responseType: 'text'
  });

  const transactionState = readTag(soapResponse, 'transactionState') ?? 'FAILED';
  const transactionType = readTag(soapResponse, 'transactionType') ?? '';
  const payuReference = readTag(soapResponse, 'payUReference') ?? input.payuReference;
  const merchantReference = readTag(soapResponse, 'merchantReference') ?? input.merchantReference ?? input.payuReference;
  const resultCode = readTag(soapResponse, 'resultCode') ?? '';
  const resultMessage = readTag(soapResponse, 'resultMessage') ?? '';
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
    rawResponse: { soapResponse, endpoint: `${input.baseUrl}/getTransaction` }
  };
};
