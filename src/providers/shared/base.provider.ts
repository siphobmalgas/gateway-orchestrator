import { createHmac } from 'crypto';
import { PaymentProviderName, PaymentStatus } from '../../domain/enums';
import { AuthorizeRequest, CaptureRequest, PaymentProvider, PaymentRequest, PaymentResponse, RefundRequest, WebhookEvent } from '../../domain/provider.interface';
import { providerLatencyHistogram } from '../../infrastructure/metrics';

export abstract class BaseProvider implements PaymentProvider {
  constructor(
    protected readonly providerName: PaymentProviderName,
    protected readonly baseUrl: string,
    protected readonly apiKey: string,
    protected readonly webhookSecret: string
  ) {}

  abstract payment(request: PaymentRequest): Promise<PaymentResponse>;
  abstract authorize(request: AuthorizeRequest): Promise<PaymentResponse>;
  abstract capture(request: CaptureRequest): Promise<PaymentResponse>;
  abstract refund(request: RefundRequest): Promise<PaymentResponse>;

  async handleWebhook(_: unknown): Promise<WebhookEvent | null> {
    return null;
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(payload).digest('hex');
    return expected === signature;
  }

  protected normalizeResponse(input: {
    providerReference: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
    rawResponse?: unknown;
  }): PaymentResponse {
    return {
      provider: this.providerName,
      providerReference: input.providerReference,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      rawResponse: input.rawResponse
    };
  }

  protected observeLatency(operation: string, startedAt: number): void {
    const seconds = (Date.now() - startedAt) / 1000;
    providerLatencyHistogram.labels(this.providerName, operation).observe(seconds);
  }
}
