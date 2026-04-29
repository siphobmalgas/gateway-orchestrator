import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { PaymentProviderName, PaymentStatus } from '../../domain/enums';
import { AuthorizeRequest, CaptureRequest, PaymentRequest, PaymentResponse, RefundRequest, VoidRequest } from '../../domain/provider.interface';
import { ApiKeyProviderRuntimeConfig } from '../provider-runtime-config';
import { BaseProvider } from '../shared/base.provider';

export class PayFastProvider extends BaseProvider {
  constructor(config: ApiKeyProviderRuntimeConfig = {
    baseUrl: env.payfast.baseUrl,
    apiKey: env.payfast.apiKey,
    webhookSecret: env.payfast.webhookSecret
  }) {
    super(PaymentProviderName.PAYFAST, config.baseUrl, config.apiKey, config.webhookSecret);
  }

  async payment(request: PaymentRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const response = this.normalizeResponse({
      providerReference: `payfast_${randomUUID()}`,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.CAPTURED,
      rawResponse: { simulated: true, endpoint: `${this.baseUrl}/payment` }
    });
    this.observeLatency('payment', startedAt);
    return response;
  }

  async authorize(request: AuthorizeRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const response = this.normalizeResponse({
      providerReference: `payfast_${randomUUID()}`,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.AUTHORIZED,
      rawResponse: { simulated: true, endpoint: `${this.baseUrl}/authorize` }
    });
    this.observeLatency('authorize', startedAt);
    return response;
  }

  async capture(request: CaptureRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const response = this.normalizeResponse({
      providerReference: request.transactionId,
      amount: 0,
      currency: 'ZAR',
      status: PaymentStatus.CAPTURED,
      rawResponse: { simulated: true, endpoint: `${this.baseUrl}/capture` }
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

  async void(request: VoidRequest): Promise<PaymentResponse> {
    const startedAt = Date.now();
    const response = this.normalizeResponse({
      providerReference: request.transactionId,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.VOIDED,
      rawResponse: { simulated: true, endpoint: `${this.baseUrl}/void` }
    });
    this.observeLatency('void', startedAt);
    return response;
  }
}
