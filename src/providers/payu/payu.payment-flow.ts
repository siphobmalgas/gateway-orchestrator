import { PayURedirectPaymentMethod, PayUSetTransactionType } from '../../domain/enums';
import { AuthorizeRequest, PaymentRequest } from '../../domain/provider.interface';
import { PayURuntimeConfig } from '../provider-runtime-config';
import { createPaymentSetTransaction, createReserveSetTransaction } from './payu.set-transaction';

export interface PayuRedirectFlowResult {
  providerReference: string;
  redirectUrl: string;
  supportedPaymentMethod: PayURedirectPaymentMethod;
  transactionType: PayUSetTransactionType;
}

export const runPayuPaymentFlow = async (
  config: PayURuntimeConfig,
  request: PaymentRequest,
  method: PayURedirectPaymentMethod
): Promise<PayuRedirectFlowResult> => {
  const providerReference = await createPaymentSetTransaction(config, request, method);
  const redirectUrl = `${config.rppRedirectBaseUrl}?PayUReference=${encodeURIComponent(providerReference)}`;

  return {
    providerReference,
    redirectUrl,
    supportedPaymentMethod: method,
    transactionType: 'PAYMENT'
  };
};

export const runPayuReserveFlow = async (
  config: PayURuntimeConfig,
  request: AuthorizeRequest,
  method: PayURedirectPaymentMethod,
  transactionType: PayUSetTransactionType
): Promise<PayuRedirectFlowResult> => {
  const providerReference = await createReserveSetTransaction(config, request, method, transactionType);
  const redirectUrl = `${config.rppRedirectBaseUrl}?PayUReference=${encodeURIComponent(providerReference)}`;

  return {
    providerReference,
    redirectUrl,
    supportedPaymentMethod: method,
    transactionType
  };
};
