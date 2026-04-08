import { env } from '../../config/env';
import { PayURedirectPaymentMethod, PayUSetTransactionType } from '../../domain/enums';
import { AuthorizeRequest, PaymentRequest } from '../../domain/provider.interface';
import { createPaymentSetTransaction, createReserveSetTransaction } from './payu.set-transaction';

export interface PayuRedirectFlowResult {
  providerReference: string;
  redirectUrl: string;
  supportedPaymentMethod: PayURedirectPaymentMethod;
  transactionType: PayUSetTransactionType;
}

export const runPayuPaymentFlow = async (
  baseUrl: string,
  request: PaymentRequest,
  method: PayURedirectPaymentMethod
): Promise<PayuRedirectFlowResult> => {
  const providerReference = await createPaymentSetTransaction(baseUrl, request, method);
  const redirectUrl = `${env.payu.rppRedirectBaseUrl}?PayUReference=${encodeURIComponent(providerReference)}`;

  return {
    providerReference,
    redirectUrl,
    supportedPaymentMethod: method,
    transactionType: 'PAYMENT'
  };
};

export const runPayuReserveFlow = async (
  baseUrl: string,
  request: AuthorizeRequest,
  method: PayURedirectPaymentMethod,
  transactionType: PayUSetTransactionType
): Promise<PayuRedirectFlowResult> => {
  const providerReference = await createReserveSetTransaction(baseUrl, request, method, transactionType);
  const redirectUrl = `${env.payu.rppRedirectBaseUrl}?PayUReference=${encodeURIComponent(providerReference)}`;

  return {
    providerReference,
    redirectUrl,
    supportedPaymentMethod: method,
    transactionType
  };
};
