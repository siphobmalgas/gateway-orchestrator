import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { PaymentProviderName, PaymentStatus } from '../../domain/enums';
import { AuthorizeRequest, CaptureRequest, PaymentRequest, PaymentResponse, RefundRequest } from '../../domain/provider.interface';
import { BaseProvider } from '../shared/base.provider';

export class PayFastProvider extends BaseProvider {
  constructor() {
    super(PaymentProviderName.PAYFAST, env.payfast.baseUrl, env.payfast.apiKey, env.payfast.webhookSecret);
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
}
