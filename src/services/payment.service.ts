import { randomUUID } from 'crypto';
import { PayURedirectPaymentMethod, PayUSetTransactionType, PaymentProviderName, PaymentStatus } from '../domain/enums';
import { ensureTransition, Payment } from '../domain/payment.entity';
import { PaymentProvider, RedirectContext } from '../domain/provider.interface';
import { logger } from '../infrastructure/logger';
import { paymentAttemptCounter } from '../infrastructure/metrics';
import { PaymentLog } from '../infrastructure/repositories/payment-log.repository';
import { PaymentLogRepository } from '../infrastructure/repositories/payment-log.repository';
import { PaymentRepository } from '../infrastructure/repositories/payment.repository';

export interface CreatePaymentInput {
  provider: PaymentProviderName;
  amount: number;
  currency: string;
  idempotencyKey: string;
  customerReference?: string;
  paymentMethod?: PayURedirectPaymentMethod;
  transactionType?: PayUSetTransactionType;
  redirectContext?: RedirectContext;
  metadata?: Record<string, unknown>;
}

export interface RefundPaymentInput {
  paymentId: string;
  amount: number;
  currency: string;
}

export class PaymentService {
  constructor(
    private readonly providers: Record<PaymentProviderName, PaymentProvider>,
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentLogRepository: PaymentLogRepository
  ) {}

  async createPayment(input: CreatePaymentInput, headers: Record<string, string | string[] | undefined>): Promise<Payment> {
    return this.authorizePayment(input, headers);
  }

  async payment(input: CreatePaymentInput, headers: Record<string, string | string[] | undefined>): Promise<Payment> {
    return this.executeInitialFlow('payment', input, headers);
  }

  async authorizePayment(input: CreatePaymentInput, headers: Record<string, string | string[] | undefined>): Promise<Payment> {
    return this.executeInitialFlow('authorize', input, headers);
  }

  private async executeInitialFlow(
    flow: 'payment' | 'authorize',
    input: CreatePaymentInput,
    headers: Record<string, string | string[] | undefined>
  ): Promise<Payment> {
    const existing = await this.paymentRepository.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const payment: Payment = {
      id: randomUUID(),
      provider: input.provider,
      amount: input.amount,
      currency: input.currency,
      status: PaymentStatus.CREATED,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.paymentRepository.create(payment);

    const provider = this.providers[input.provider];
    const startedAt = Date.now();
    const requestPayload = {
      paymentId: payment.id,
      amount: input.amount,
      currency: input.currency,
      customerReference: input.customerReference,
      paymentMethod: input.paymentMethod,
      transactionType: input.transactionType,
      redirectContext: input.redirectContext,
      metadata: input.metadata
    };

    const response = flow === 'payment' ? await provider.payment(requestPayload) : await provider.authorize(requestPayload);

    ensureTransition(payment.status, response.status);
    payment.status = response.status;
    payment.providerReference = response.providerReference;
    payment.checkoutUrl = response.redirectUrl;
    payment.updatedAt = new Date();
    await this.paymentRepository.update(payment);

    await this.paymentLogRepository.create({
      id: randomUUID(),
      paymentId: payment.id,
      provider: payment.provider,
      request: { ...input, flow },
      response,
      headers,
      responseTimeMs: Date.now() - startedAt,
      createdAt: new Date()
    });

    paymentAttemptCounter.labels(input.provider, payment.status).inc();
    logger.info(flow === 'payment' ? 'Payment completed' : 'Payment authorized', {
      paymentId: payment.id,
      provider: payment.provider,
      status: payment.status
    });

    return payment;
  }

  async capturePayment(paymentId: string, headers: Record<string, string | string[] | undefined>): Promise<Payment> {
    const payment = await this.getExistingPayment(paymentId);
    if (!payment.providerReference) {
      throw new Error('Missing provider reference for capture');
    }

    const provider = this.providers[payment.provider];
    const startedAt = Date.now();
    const response = await provider.capture({
      transactionId: payment.providerReference,
      amount: payment.amount,
      currency: payment.currency,
      merchantReference: payment.id
    });

    ensureTransition(payment.status, response.status);
    payment.status = response.status;
    payment.updatedAt = new Date();
    await this.paymentRepository.update(payment);

    await this.paymentLogRepository.create({
      id: randomUUID(),
      paymentId: payment.id,
      provider: payment.provider,
      request: { paymentId: payment.id, operation: 'capture' },
      response,
      headers,
      responseTimeMs: Date.now() - startedAt,
      createdAt: new Date()
    });

    return payment;
  }

  async refundPayment(input: RefundPaymentInput, headers: Record<string, string | string[] | undefined>): Promise<Payment> {
    const payment = await this.getExistingPayment(input.paymentId);
    if (!payment.providerReference) {
      throw new Error('Missing provider reference for refund');
    }

    const provider = this.providers[payment.provider];
    const startedAt = Date.now();
    const response = await provider.refund({
      transactionId: payment.providerReference,
      amount: input.amount,
      currency: input.currency
    });

    ensureTransition(payment.status, response.status);
    payment.status = response.status;
    payment.updatedAt = new Date();
    await this.paymentRepository.update(payment);

    await this.paymentLogRepository.create({
      id: randomUUID(),
      paymentId: payment.id,
      provider: payment.provider,
      request: { paymentId: payment.id, operation: 'refund', amount: input.amount, currency: input.currency },
      response,
      headers,
      responseTimeMs: Date.now() - startedAt,
      createdAt: new Date()
    });

    return payment;
  }

  async getPayment(paymentId: string): Promise<Payment | null> {
    return this.paymentRepository.findById(paymentId);
  }

  async listTransactions(): Promise<Payment[]> {
    return this.paymentRepository.listAll();
  }

  async listTransactionLogs(paymentId: string): Promise<PaymentLog[]> {
    await this.getExistingPayment(paymentId);
    return this.paymentLogRepository.listByPaymentId(paymentId);
  }

  async handleWebhook(providerName: PaymentProviderName, rawPayload: string, signature: string, parsedPayload: unknown): Promise<void> {
    const provider = this.providers[providerName];

    const verified = provider.verifyWebhookSignature(rawPayload, signature);
    if (!verified) {
      throw new Error(`Invalid ${providerName} webhook signature`);
    }

    const event = await provider.handleWebhook(typeof parsedPayload === 'string' ? parsedPayload : rawPayload);

    if (event?.merchantReference) {
      const payment = await this.paymentRepository.findById(event.merchantReference);
      if (payment) {
        if (event.providerReference) {
          payment.providerReference = event.providerReference;
        }

        if (event.status && payment.status !== event.status) {
          try {
            ensureTransition(payment.status, event.status);
            payment.status = event.status;
          } catch {
            payment.status = event.status;
          }
        }

        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
      }
    }

    logger.info('Webhook processed', { provider: providerName });
  }

  private async getExistingPayment(paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new Error(`Payment not found: ${paymentId}`);
    }
    return payment;
  }
}
