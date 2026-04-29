import { createHash, randomUUID } from 'crypto';
import { env } from '../config/env';
import { PayURedirectPaymentMethod, PayUSetTransactionType, PaymentProviderName, PaymentStatus } from '../domain/enums';
import { PaymentOperation, PaymentOperationType } from '../domain/payment-operation.entity';
import { ensureTransition, Payment } from '../domain/payment.entity';
import { WebhookEventRecord } from '../domain/webhook-event.entity';
import { LookupTransactionResult, PaymentProvider, PaymentResponse, RedirectContext, WebhookEvent } from '../domain/provider.interface';
import { HttpRequestError } from '../errors/http-request.error';
import { ProviderOperationError } from '../errors/provider-operation.error';
import { PaymentProviderFactory } from '../infrastructure/provider-registry';
import { logger } from '../infrastructure/logger';
import { paymentAttemptCounter } from '../infrastructure/metrics';
import { PaymentLog } from '../infrastructure/repositories/payment-log.repository';
import { PaymentLogRepository } from '../infrastructure/repositories/payment-log.repository';
import { PaymentOperationRepository } from '../infrastructure/repositories/payment-operation.repository';
import { ProviderConfigRepository, ProviderCredential } from '../infrastructure/repositories/provider-config.repository';
import { PaymentRepository } from '../infrastructure/repositories/payment.repository';
import { WebhookEventRepository } from '../infrastructure/repositories/webhook-event.repository';
import { RoutingService } from './routing.service';

type ProviderFailureMetadata = {
  resultCode?: string;
  resultMessage?: string;
  displayMessage?: string;
  pointOfFailure?: string;
};

export interface CreatePaymentInput {
  provider?: PaymentProviderName;
  merchantIdentifier?: string;
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

export interface VoidPaymentInput {
  paymentId: string;
}

export class PaymentService {
  constructor(
    private readonly providers: Partial<Record<PaymentProviderName, PaymentProvider | PaymentProviderFactory>>,
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentLogRepository: PaymentLogRepository,
    private readonly paymentOperationRepository: PaymentOperationRepository,
    private readonly webhookEventRepository: WebhookEventRepository,
    private readonly routingService: RoutingService,
    private readonly providerConfigRepository: ProviderConfigRepository
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

  private async markPaymentFailed(payment: Payment): Promise<void> {
    ensureTransition(payment.status, PaymentStatus.FAILED);
    payment.status = PaymentStatus.FAILED;
    payment.updatedAt = new Date();
    await this.paymentRepository.update(payment);
  }

  private async executeInitialFlow(
    flow: 'payment' | 'authorize',
    input: CreatePaymentInput,
    headers: Record<string, string | string[] | undefined>
  ): Promise<Payment> {
    const initialRequestHash = this.hashInitialRequest(flow, input);
    const existing = await this.paymentRepository.findByIdempotencyKey(input.idempotencyKey, input.merchantIdentifier);
    if (existing) {
      if (existing.initialRequestHash && existing.initialRequestHash !== initialRequestHash) {
        throw new ProviderOperationError(`${flow.toUpperCase()} idempotency key was reused for a different request`, {
          statusCode: 409,
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          details: {
            merchantIdentifier: input.merchantIdentifier,
            provider: input.provider,
            flow,
            idempotencyKey: input.idempotencyKey
          }
        });
      }

      return existing;
    }

    const candidates = await this.routingService.resolveCandidates({
      merchantIdentifier: input.merchantIdentifier,
      explicitProvider: input.provider,
      paymentMethod: input.paymentMethod,
      currency: input.currency
    });

    const payment: Payment = {
      id: randomUUID(),
      merchantIdentifier: input.merchantIdentifier,
      provider: candidates[0].provider,
      amount: input.amount,
      currency: input.currency,
      status: PaymentStatus.CREATED,
      idempotencyKey: input.idempotencyKey,
      initialRequestHash,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.paymentRepository.create(payment);
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

    let lastError: unknown;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const credential = candidate.credential ?? (await this.getDefaultCredential(candidate.provider));
      const provider = this.resolveProvider(candidate.provider, credential);

      const startedAt = Date.now();
      payment.provider = candidate.provider;

      try {
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
          request: {
            ...input,
            flow,
            resolvedProvider: candidate.provider,
            routingRuleId: candidate.ruleId,
            merchantCredentialProvider: credential?.provider
          },
          response,
          headers,
          responseTimeMs: Date.now() - startedAt,
          createdAt: new Date()
        });

        paymentAttemptCounter.labels(payment.provider, payment.status).inc();
        logger.info(flow === 'payment' ? 'Payment completed' : 'Payment authorized', {
          paymentId: payment.id,
          merchantIdentifier: payment.merchantIdentifier,
          provider: payment.provider,
          status: payment.status,
          routingRuleId: candidate.ruleId
        });

        return payment;
      } catch (error) {
        lastError = error;

        await this.paymentLogRepository.create({
          id: randomUUID(),
          paymentId: payment.id,
          provider: candidate.provider,
          request: {
            ...input,
            flow,
            resolvedProvider: candidate.provider,
            routingRuleId: candidate.ruleId,
            merchantCredentialProvider: credential?.provider
          },
          response: this.serializeError(error),
          headers,
          responseTimeMs: Date.now() - startedAt,
          createdAt: new Date()
        });

        const shouldTryNextProvider = index < candidates.length - 1 && this.isRetryableProviderError(error);
        if (shouldTryNextProvider) {
          logger.warn('Provider attempt failed; trying next routed provider', {
            paymentId: payment.id,
            merchantIdentifier: payment.merchantIdentifier,
            provider: candidate.provider,
            nextProvider: candidates[index + 1].provider,
            message: error instanceof Error ? error.message : 'Unknown provider error'
          });
          continue;
        }

        await this.markPaymentFailed(payment);
        throw error;
      }
    }

    await this.markPaymentFailed(payment);

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error(`Unable to ${flow} payment`);
  }

  async capturePayment(paymentId: string, headers: Record<string, string | string[] | undefined>): Promise<Payment> {
    return this.executeStoredOperation({
      paymentId,
      type: 'CAPTURE',
      headers,
      requestPayload: {},
      buildProviderRequest: (payment) => ({
        transactionId: payment.providerReference!,
        amount: payment.amount,
        currency: payment.currency,
        merchantReference: payment.id
      }),
      invokeProvider: (provider, providerRequest) => provider.capture(providerRequest),
      logRequest: (payment) => ({ paymentId: payment.id, operation: 'capture' })
    });
  }

  async refundPayment(input: RefundPaymentInput, headers: Record<string, string | string[] | undefined>): Promise<Payment> {
    return this.executeStoredOperation({
      paymentId: input.paymentId,
      type: 'REFUND',
      headers,
      requestPayload: {
        amount: input.amount,
        currency: input.currency
      },
      buildProviderRequest: (payment) => ({
        transactionId: payment.providerReference!,
        amount: input.amount,
        currency: input.currency,
        merchantReference: payment.id
      }),
      invokeProvider: (provider, providerRequest) => provider.refund(providerRequest),
      logRequest: (payment) => ({ paymentId: payment.id, operation: 'refund', amount: input.amount, currency: input.currency })
    });
  }

  async voidPayment(input: VoidPaymentInput, headers: Record<string, string | string[] | undefined>): Promise<Payment> {
    return this.executeStoredOperation({
      paymentId: input.paymentId,
      type: 'VOID',
      headers,
      requestPayload: {},
      buildProviderRequest: (payment) => ({
        transactionId: payment.providerReference!,
        amount: payment.amount,
        currency: payment.currency,
        merchantReference: payment.id
      }),
      invokeProvider: (provider, providerRequest) => provider.void(providerRequest),
      logRequest: (payment) => ({ paymentId: payment.id, operation: 'void' })
    });
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

  async listWebhookEvents(paymentId: string): Promise<WebhookEventRecord[]> {
    await this.getExistingPayment(paymentId);
    return this.webhookEventRepository.listByPaymentId(paymentId);
  }

  async lookupProviderStatus(
    paymentId: string,
    headers: Record<string, string | string[] | undefined>
  ): Promise<LookupTransactionResult> {
    const payment = await this.getExistingPayment(paymentId);
    if (!payment.providerReference) {
      throw new Error(`No provider reference for payment: ${paymentId}`);
    }

    const credential = await this.getCredentialForPayment(payment);
    const provider = this.resolveProvider(payment.provider, credential);
    if (!provider.lookupTransaction) {
      throw new Error(`Provider ${payment.provider} does not support transaction lookup`);
    }

    const startedAt = Date.now();
    const result = await provider.lookupTransaction({
      payuReference: payment.providerReference,
      merchantReference: payment.id
    });

    if (result.payuReference && payment.providerReference !== result.payuReference) {
      payment.providerReference = result.payuReference;
    }

    if (payment.status !== result.status) {
      ensureTransition(payment.status, result.status);
      payment.status = result.status;
    }

    payment.updatedAt = new Date();
    await this.paymentRepository.update(payment);

    await this.paymentLogRepository.create({
      id: randomUUID(),
      paymentId: payment.id,
      provider: payment.provider,
      request: { paymentId: payment.id, operation: 'provider-status-lookup', providerReference: payment.providerReference },
      response: result,
      headers,
      responseTimeMs: Date.now() - startedAt,
      createdAt: new Date()
    });

    return result;
  }

  async handleWebhook(providerName: PaymentProviderName, rawPayload: string, signature: string, parsedPayload: unknown): Promise<void> {
    const startedAt = Date.now();
    const payloadHash = this.hashText(rawPayload);
    const provider = this.resolveProvider(providerName);
    let event: WebhookEvent | null = null;
    let webhookRecord: WebhookEventRecord | null = null;
    let dedupeKey = this.createWebhookDedupeKey(providerName, null, payloadHash);

    try {
      const verified = provider.verifyWebhookSignature(rawPayload, signature);
      if (!verified) {
        webhookRecord = await this.startWebhookRecord({
          providerName,
          dedupeKey,
          payloadHash,
          signature,
          rawPayload,
          event: null
        });
        webhookRecord.state = 'FAILED';
        webhookRecord.errorMessage = `Invalid ${providerName} webhook signature`;
        webhookRecord.updatedAt = new Date();
        await this.webhookEventRepository.update(webhookRecord);
        throw new Error(`Invalid ${providerName} webhook signature`);
      }

      const providerPayload = typeof parsedPayload === 'undefined' ? rawPayload : parsedPayload;
      event = await provider.handleWebhook(providerPayload);
      dedupeKey = this.createWebhookDedupeKey(providerName, event, payloadHash);

      const existingRecord = await this.webhookEventRepository.findByDedupeKey(dedupeKey);
      if (existingRecord) {
        if (existingRecord.state === 'SUCCEEDED' || existingRecord.state === 'IGNORED' || existingRecord.state === 'STARTED') {
          logger.info('Duplicate webhook skipped', {
            provider: providerName,
            dedupeKey,
            state: existingRecord.state
          });
          return;
        }

        webhookRecord = {
          ...existingRecord,
          merchantReference: event?.merchantReference,
          providerReference: event?.providerReference,
          responseHash: event?.responseHash,
          payloadHash,
          signature,
          rawPayload,
          event,
          state: 'STARTED',
          errorMessage: undefined,
          updatedAt: new Date()
        };
        await this.webhookEventRepository.update(webhookRecord);
      } else {
        webhookRecord = await this.startWebhookRecord({
          providerName,
          dedupeKey,
          payloadHash,
          signature,
          rawPayload,
          event
        });
      }

      if (!event) {
        webhookRecord.state = 'IGNORED';
        webhookRecord.updatedAt = new Date();
        await this.webhookEventRepository.update(webhookRecord);
        logger.info('Webhook ignored', { provider: providerName, dedupeKey });
        return;
      }

      if (!event.merchantReference) {
        webhookRecord.state = 'FAILED';
        webhookRecord.errorMessage = 'Webhook missing merchant reference';
        webhookRecord.updatedAt = new Date();
        await this.webhookEventRepository.update(webhookRecord);
        logger.warn('Webhook missing merchant reference', { provider: providerName, dedupeKey });
        return;
      }

      const payment = await this.paymentRepository.findById(event.merchantReference);
      if (!payment) {
        webhookRecord.merchantReference = event.merchantReference;
        webhookRecord.state = 'FAILED';
        webhookRecord.errorMessage = `Payment not found: ${event.merchantReference}`;
        webhookRecord.updatedAt = new Date();
        await this.webhookEventRepository.update(webhookRecord);
        logger.warn('Webhook payment not found', {
          provider: providerName,
          dedupeKey,
          merchantReference: event.merchantReference
        });
        return;
      }

      const previousStatus = payment.status;
      const previousProviderReference = payment.providerReference;

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

      await this.paymentLogRepository.create({
        id: randomUUID(),
        paymentId: payment.id,
        provider: payment.provider,
        request: {
          paymentId: payment.id,
          operation: 'webhook',
          dedupeKey,
          responseHash: event.responseHash,
          merchantReference: event.merchantReference,
          providerReference: event.providerReference,
          rawPayload
        },
        response: {
          event,
          previousStatus,
          updatedStatus: payment.status,
          previousProviderReference,
          updatedProviderReference: payment.providerReference
        },
        headers: {
          'x-signature': signature
        },
        responseTimeMs: Date.now() - startedAt,
        createdAt: new Date()
      });

      webhookRecord.paymentId = payment.id;
      webhookRecord.resultingPaymentStatus = payment.status;
      webhookRecord.state = 'SUCCEEDED';
      webhookRecord.updatedAt = new Date();
      await this.webhookEventRepository.update(webhookRecord);

      logger.info('Webhook processed', {
        provider: providerName,
        paymentId: payment.id,
        dedupeKey
      });
    } catch (error) {
      if (webhookRecord) {
        webhookRecord.state = 'FAILED';
        webhookRecord.errorMessage = error instanceof Error ? error.message : 'Webhook processing failed';
        webhookRecord.updatedAt = new Date();
        await this.webhookEventRepository.update(webhookRecord);
      }

      throw error;
    }
  }

  private async getExistingPayment(paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new Error(`Payment not found: ${paymentId}`);
    }
    return payment;
  }

  private applyOperationResult(
    payment: Payment,
    response: PaymentResponse,
    operation: 'capture' | 'refund' | 'void'
  ): ProviderOperationError | undefined {
    if (response.providerReference) {
      payment.providerReference = response.providerReference;
    }

    if (response.status === PaymentStatus.FAILED) {
      const failure = this.extractProviderFailureMetadata(response.rawResponse);
      logger.warn('Provider operation failed; preserving current payment status', {
        paymentId: payment.id,
        operation,
        currentStatus: payment.status,
        providerReference: payment.providerReference,
        ...failure
      });

      const reason = failure.resultMessage || failure.displayMessage || 'Provider operation failed';
      const message = `${payment.provider} ${operation} failed: ${reason}${failure.resultCode ? ` (resultCode=${failure.resultCode})` : ''}`;

      return new ProviderOperationError(message, {
        code: failure.resultCode,
        details: {
          provider: payment.provider,
          operation,
          providerReference: payment.providerReference,
          currentStatus: payment.status,
          resultMessage: failure.resultMessage,
          displayMessage: failure.displayMessage,
          pointOfFailure: failure.pointOfFailure
        }
      });
    }

    ensureTransition(payment.status, response.status);
    payment.status = response.status;
    return undefined;
  }

  private async executeStoredOperation<TProviderRequest>(input: {
    paymentId: string;
    type: PaymentOperationType;
    headers: Record<string, string | string[] | undefined>;
    requestPayload: Record<string, unknown>;
    buildProviderRequest: (payment: Payment) => TProviderRequest;
    invokeProvider: (provider: PaymentProvider, request: TProviderRequest) => Promise<PaymentResponse>;
    logRequest: (payment: Payment) => Record<string, unknown>;
  }): Promise<Payment> {
    const payment = await this.getExistingPayment(input.paymentId);
    if (!payment.providerReference) {
      throw new Error(`Missing provider reference for ${input.type.toLowerCase()}`);
    }

    const requestHash = this.hashRequest({
      paymentId: input.paymentId,
      type: input.type,
      ...input.requestPayload
    });
    const explicitIdempotencyKey = this.getHeaderValue(input.headers, 'idempotency-key');
    const effectiveIdempotencyKey = explicitIdempotencyKey ?? requestHash;
    const existingOperation = await this.paymentOperationRepository.findByIdempotencyKey(payment.id, input.type, effectiveIdempotencyKey);

    if (existingOperation) {
      if (existingOperation.requestHash !== requestHash) {
        throw new ProviderOperationError(`${input.type} idempotency key was reused for a different request`, {
          statusCode: 409,
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          details: {
            paymentId: payment.id,
            operation: input.type,
            idempotencyKey: effectiveIdempotencyKey
          }
        });
      }

      if (existingOperation.state === 'FAILED') {
        throw new ProviderOperationError(existingOperation.errorMessage ?? `${input.type} previously failed`, {
          code: existingOperation.errorCode,
          details: {
            paymentId: payment.id,
            operation: input.type,
            idempotencyKey: effectiveIdempotencyKey
          }
        });
      }

      if (existingOperation.state === 'STARTED') {
        throw new ProviderOperationError(`${input.type} is already in progress for payment ${payment.id}`, {
          statusCode: 409,
          code: 'OPERATION_IN_PROGRESS',
          details: {
            paymentId: payment.id,
            operation: input.type,
            idempotencyKey: effectiveIdempotencyKey
          }
        });
      }

      return payment;
    }

    const operation: PaymentOperation = {
      id: randomUUID(),
      paymentId: payment.id,
      merchantIdentifier: payment.merchantIdentifier,
      provider: payment.provider,
      type: input.type,
      idempotencyKey: effectiveIdempotencyKey,
      requestHash,
      amount: typeof input.requestPayload.amount === 'number' ? input.requestPayload.amount : undefined,
      currency: typeof input.requestPayload.currency === 'string' ? input.requestPayload.currency : undefined,
      state: 'STARTED',
      providerReference: payment.providerReference,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await this.paymentOperationRepository.create(operation);

    const credential = await this.getCredentialForPayment(payment);
    const provider = this.resolveProvider(payment.provider, credential);

    const startedAt = Date.now();
    const logRequest = input.logRequest(payment);

    try {
      const response = await input.invokeProvider(provider, input.buildProviderRequest(payment));
      const operationName = input.type.toLowerCase() as 'capture' | 'refund' | 'void';
      const failure = this.applyOperationResult(payment, response, operationName);
      payment.updatedAt = new Date();
      await this.paymentRepository.update(payment);

      await this.paymentLogRepository.create({
        id: randomUUID(),
        paymentId: payment.id,
        provider: payment.provider,
        request: logRequest,
        response,
        headers: input.headers,
        responseTimeMs: Date.now() - startedAt,
        createdAt: new Date()
      });

      operation.state = failure ? 'FAILED' : 'SUCCEEDED';
      operation.resultingPaymentStatus = payment.status;
      operation.providerReference = payment.providerReference;
      operation.errorCode = failure?.code;
      operation.errorMessage = failure?.message;
      operation.updatedAt = new Date();
      await this.paymentOperationRepository.update(operation);

      if (failure) {
        throw failure;
      }

      return payment;
    } catch (error) {
      const shouldLogError = !(error instanceof ProviderOperationError && operation.state === 'FAILED');
      if (shouldLogError) {
        await this.paymentLogRepository.create({
          id: randomUUID(),
          paymentId: payment.id,
          provider: payment.provider,
          request: logRequest,
          response: this.serializeError(error),
          headers: input.headers,
          responseTimeMs: Date.now() - startedAt,
          createdAt: new Date()
        });
      }

      if (operation.state !== 'FAILED') {
        operation.state = 'FAILED';
        operation.errorCode = error instanceof ProviderOperationError ? error.code : undefined;
        operation.errorMessage = error instanceof Error ? error.message : `${input.type} failed`;
        operation.updatedAt = new Date();
        await this.paymentOperationRepository.update(operation);
      }

      throw error;
    }
  }

  private getHeaderValue(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const firstValue = value.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
      return typeof firstValue === 'string' ? firstValue.trim() : undefined;
    }

    return undefined;
  }

  private hashRequest(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private hashText(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private hashInitialRequest(flow: 'payment' | 'authorize', input: CreatePaymentInput): string {
    return this.hashRequest({
      flow,
      merchantIdentifier: input.merchantIdentifier ?? null,
      provider: input.provider ?? null,
      amount: input.amount,
      currency: input.currency,
      customerReference: input.customerReference ?? null,
      paymentMethod: input.paymentMethod ?? null,
      transactionType: input.transactionType ?? null,
      redirectContext: input.redirectContext ?? null,
      metadata: input.metadata ?? null
    });
  }

  private createWebhookDedupeKey(providerName: PaymentProviderName, event: WebhookEvent | null, payloadHash: string): string {
    if (event?.responseHash) {
      return `${providerName}:responseHash:${event.responseHash}`;
    }

    if (event?.providerReference) {
      return `${providerName}:providerReference:${event.providerReference}`;
    }

    return `${providerName}:payloadHash:${payloadHash}`;
  }

  private async startWebhookRecord(input: {
    providerName: PaymentProviderName;
    dedupeKey: string;
    payloadHash: string;
    signature: string;
    rawPayload: string;
    event: WebhookEvent | null;
  }): Promise<WebhookEventRecord> {
    const record: WebhookEventRecord = {
      id: randomUUID(),
      provider: input.providerName,
      merchantReference: input.event?.merchantReference,
      providerReference: input.event?.providerReference,
      responseHash: input.event?.responseHash,
      payloadHash: input.payloadHash,
      dedupeKey: input.dedupeKey,
      signature: input.signature,
      rawPayload: input.rawPayload,
      event: input.event,
      state: 'STARTED',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.webhookEventRepository.create(record);
    return record;
  }

  private async getCredentialForPayment(payment: Payment): Promise<ProviderCredential | null> {
    const merchantIdentifier = payment.merchantIdentifier ?? this.getDefaultMongoMerchantIdentifier();
    if (!merchantIdentifier) {
      return null;
    }

    return this.providerConfigRepository.getCredential(merchantIdentifier, payment.provider);
  }

  private async getDefaultCredential(provider: PaymentProviderName): Promise<ProviderCredential | null> {
    const merchantIdentifier = this.getDefaultMongoMerchantIdentifier();
    if (!merchantIdentifier) {
      return null;
    }

    return this.providerConfigRepository.getCredential(merchantIdentifier, provider);
  }

  private getDefaultMongoMerchantIdentifier(): string | undefined {
    if (!env.mongo.enabled) {
      return undefined;
    }

    return env.mongo.defaultMerchantIdentifier;
  }

  private resolveProvider(providerName: PaymentProviderName, credential?: ProviderCredential | null): PaymentProvider {
    const entry = this.providers[providerName];
    if (!entry) {
      throw new Error(`Provider not configured in runtime: ${providerName}`);
    }

    if (typeof entry === 'function') {
      return entry(credential);
    }

    return entry;
  }

  private isRetryableProviderError(error: unknown): boolean {
    return error instanceof HttpRequestError && error.retryable;
  }

  private serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof HttpRequestError) {
      return {
        name: error.name,
        message: error.message,
        retryable: error.retryable,
        statusCode: error.statusCode,
        responsePreview: error.responsePreview
      };
    }

    if (error instanceof ProviderOperationError) {
      return {
        name: error.name,
        message: error.message,
        code: error.code,
        details: error.details
      };
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message
      };
    }

    return {
      message: 'Unknown error'
    };
  }

  private extractProviderFailureMetadata(rawResponse: unknown): ProviderFailureMetadata {
    if (!rawResponse || typeof rawResponse !== 'object') {
      return {};
    }

    const result = 'result' in rawResponse ? (rawResponse as { result?: unknown }).result : undefined;
    if (!result || typeof result !== 'object') {
      return {};
    }

    const details = result as Record<string, unknown>;
    return {
      resultCode: typeof details.resultCode === 'string' ? details.resultCode : undefined,
      resultMessage: typeof details.resultMessage === 'string' ? details.resultMessage : undefined,
      displayMessage: typeof details.displayMessage === 'string' ? details.displayMessage : undefined,
      pointOfFailure: typeof details.pointOfFailure === 'string' ? details.pointOfFailure : undefined
    };
  }
}
