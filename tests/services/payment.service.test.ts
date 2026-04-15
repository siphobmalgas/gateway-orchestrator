import { env } from '../../src/config/env';
import { PaymentProviderName, PaymentStatus } from '../../src/domain/enums';
import { PaymentProvider, PaymentResponse } from '../../src/domain/provider.interface';
import { HttpRequestError } from '../../src/errors/http-request.error';
import { ProviderOperationError } from '../../src/errors/provider-operation.error';
import {
  InMemoryMerchantRepository,
  InMemoryPaymentLogRepository,
  InMemoryPaymentOperationRepository,
  InMemoryPaymentRepository,
  InMemoryProviderConfigRepository,
  InMemoryWebhookEventRepository
} from '../../src/infrastructure/repositories/in-memory.repositories';
import { PaymentProviderFactory } from '../../src/infrastructure/provider-registry';
import { PaymentService } from '../../src/services/payment.service';
import { RoutingService } from '../../src/services/routing.service';

const createProviderResponse = (provider: PaymentProviderName, status: PaymentStatus, rawResponse?: unknown): PaymentResponse => ({
  provider,
  providerReference: 'payu_ref_1',
  amount: 120,
  currency: 'ZAR',
  status,
  rawResponse
});

const createProviderStub = (providerName: PaymentProviderName, overrides: Partial<PaymentProvider> = {}): PaymentProvider => ({
  payment: jest.fn().mockResolvedValue(createProviderResponse(providerName, PaymentStatus.CAPTURED)),
  authorize: jest.fn().mockResolvedValue(createProviderResponse(providerName, PaymentStatus.AUTHORIZED)),
  capture: jest.fn().mockResolvedValue(createProviderResponse(providerName, PaymentStatus.CAPTURED)),
  refund: jest.fn().mockResolvedValue(createProviderResponse(providerName, PaymentStatus.REFUNDED)),
  void: jest.fn().mockResolvedValue(createProviderResponse(providerName, PaymentStatus.VOIDED)),
  verifyWebhookSignature: jest.fn().mockReturnValue(true),
  handleWebhook: jest.fn().mockResolvedValue(null),
  ...overrides
});

const createService = (providers: Partial<Record<PaymentProviderName, PaymentProvider | PaymentProviderFactory>>) => {
  const paymentRepository = new InMemoryPaymentRepository();
  const paymentLogRepository = new InMemoryPaymentLogRepository();
  const paymentOperationRepository = new InMemoryPaymentOperationRepository();
  const webhookEventRepository = new InMemoryWebhookEventRepository();
  const providerConfigRepository = new InMemoryProviderConfigRepository();
  const merchantRepository = new InMemoryMerchantRepository();
  const routingService = new RoutingService(providerConfigRepository, merchantRepository);

  return {
    service: new PaymentService(
      providers,
      paymentRepository,
      paymentLogRepository,
      paymentOperationRepository,
      webhookEventRepository,
      routingService,
      providerConfigRepository
    ),
    paymentRepository,
    paymentLogRepository,
    paymentOperationRepository,
    webhookEventRepository,
    providerConfigRepository,
    merchantRepository
  };
};

describe('PaymentService provider operation failures', () => {
  it('throws a provider error with the PayU reason and preserves the stored status on failed capture', async () => {
    const provider = createProviderStub(PaymentProviderName.PAYU, {
      capture: jest.fn().mockResolvedValue(
        createProviderResponse(PaymentProviderName.PAYU, PaymentStatus.FAILED, {
          result: {
            resultCode: 'P022',
            resultMessage: 'Transaction is not in the correct state - last transaction: FINALIZE state: SUCCESSFUL',
            displayMessage: 'An error occurred with this payment, please contact your merchant (ref: P022)',
            pointOfFailure: 'PAYU'
          }
        })
      )
    });

    const { service, paymentRepository, paymentLogRepository } = createService({
      [PaymentProviderName.PAYU]: provider
    } as Record<PaymentProviderName, PaymentProvider>);

    await paymentRepository.create({
      id: 'payment_1',
      provider: PaymentProviderName.PAYU,
      amount: 120,
      currency: 'ZAR',
      status: PaymentStatus.CAPTURED,
      providerReference: 'payu_ref_1',
      idempotencyKey: 'idem-1',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await expect(service.capturePayment('payment_1', {})).rejects.toMatchObject<ProviderOperationError>({
      name: 'ProviderOperationError',
      statusCode: 409,
      code: 'P022',
      message: 'PAYU capture failed: Transaction is not in the correct state - last transaction: FINALIZE state: SUCCESSFUL (resultCode=P022)'
    });

    const stored = await paymentRepository.findById('payment_1');
    expect(stored?.status).toBe(PaymentStatus.CAPTURED);

    const logs = await paymentLogRepository.listByPaymentId('payment_1');
    expect(logs).toHaveLength(1);
    expect(logs[0].response).toMatchObject({
      status: PaymentStatus.FAILED,
      rawResponse: {
        result: {
          resultCode: 'P022'
        }
      }
    });
  });

  it('throws a provider error with the PayU reason and preserves the stored status on failed refund', async () => {
    const provider = createProviderStub(PaymentProviderName.PAYU, {
      refund: jest.fn().mockResolvedValue(
        createProviderResponse(PaymentProviderName.PAYU, PaymentStatus.FAILED, {
          result: {
            resultCode: 'P019',
            resultMessage: 'Transaction amount must be equal to less than original transaction amount',
            displayMessage: 'An error occurred with this payment, please contact your merchant (ref: P019)',
            pointOfFailure: 'PAYU'
          }
        })
      )
    });

    const { service, paymentRepository, paymentLogRepository } = createService({
      [PaymentProviderName.PAYU]: provider
    } as Record<PaymentProviderName, PaymentProvider>);

    await paymentRepository.create({
      id: 'payment_2',
      provider: PaymentProviderName.PAYU,
      amount: 120,
      currency: 'ZAR',
      status: PaymentStatus.REFUNDED,
      providerReference: 'payu_ref_2',
      idempotencyKey: 'idem-2',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await expect(service.refundPayment({ paymentId: 'payment_2', amount: 120, currency: 'ZAR' }, {})).rejects.toMatchObject<ProviderOperationError>({
      name: 'ProviderOperationError',
      statusCode: 409,
      code: 'P019',
      message: 'PAYU refund failed: Transaction amount must be equal to less than original transaction amount (resultCode=P019)'
    });

    const stored = await paymentRepository.findById('payment_2');
    expect(stored?.status).toBe(PaymentStatus.REFUNDED);

    const logs = await paymentLogRepository.listByPaymentId('payment_2');
    expect(logs).toHaveLength(1);
    expect(logs[0].response).toMatchObject({
      status: PaymentStatus.FAILED,
      rawResponse: {
        result: {
          resultCode: 'P019'
        }
      }
    });
  });

  it('throws a provider error with the PayU reason and preserves the stored status on failed void', async () => {
    const provider = createProviderStub(PaymentProviderName.PAYU, {
      void: jest.fn().mockResolvedValue(
        createProviderResponse(PaymentProviderName.PAYU, PaymentStatus.FAILED, {
          result: {
            resultCode: 'P022',
            resultMessage: 'Transaction is not in the correct state - last transaction: RESERVE_CANCEL state: SUCCESSFUL',
            displayMessage: 'An error occurred with this payment, please contact your merchant (ref: P022)',
            pointOfFailure: 'PAYU'
          }
        })
      )
    });

    const { service, paymentRepository, paymentLogRepository } = createService({
      [PaymentProviderName.PAYU]: provider
    } as Record<PaymentProviderName, PaymentProvider>);

    await paymentRepository.create({
      id: 'payment_3',
      provider: PaymentProviderName.PAYU,
      amount: 120,
      currency: 'ZAR',
      status: PaymentStatus.VOIDED,
      providerReference: 'payu_ref_3',
      idempotencyKey: 'idem-3',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await expect(service.voidPayment({ paymentId: 'payment_3' }, {})).rejects.toMatchObject<ProviderOperationError>({
      name: 'ProviderOperationError',
      statusCode: 409,
      code: 'P022',
      message: 'PAYU void failed: Transaction is not in the correct state - last transaction: RESERVE_CANCEL state: SUCCESSFUL (resultCode=P022)'
    });

    const stored = await paymentRepository.findById('payment_3');
    expect(stored?.status).toBe(PaymentStatus.VOIDED);

    const logs = await paymentLogRepository.listByPaymentId('payment_3');
    expect(logs).toHaveLength(1);
    expect(logs[0].response).toMatchObject({
      status: PaymentStatus.FAILED,
      rawResponse: {
        result: {
          resultCode: 'P022'
        }
      }
    });
  });
});

describe('PaymentService routing and idempotency', () => {
  const originalMongoEnabled = env.mongo.enabled;
  const originalDefaultMerchantIdentifier = env.mongo.defaultMerchantIdentifier;

  afterEach(() => {
    env.mongo.enabled = originalMongoEnabled;
    env.mongo.defaultMerchantIdentifier = originalDefaultMerchantIdentifier;
  });

  it('fails over to the next routed provider when the higher-priority provider fails with a retryable error', async () => {
    const payfastProvider = createProviderStub(PaymentProviderName.PAYFAST, {
      authorize: jest.fn().mockRejectedValue(new HttpRequestError('timeout', { retryable: true }))
    });
    const payuProvider = createProviderStub(PaymentProviderName.PAYU, {
      authorize: jest.fn().mockResolvedValue(createProviderResponse(PaymentProviderName.PAYU, PaymentStatus.PENDING))
    });

    const { service, providerConfigRepository, merchantRepository } = createService({
      [PaymentProviderName.PAYFAST]: payfastProvider,
      [PaymentProviderName.PAYU]: payuProvider
    } as Record<PaymentProviderName, PaymentProvider>);

    await merchantRepository.create({
      id: 'merchant-id-1',
      merchantIdentifier: 'merchant-routed',
      merchantName: 'Routed Merchant',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await providerConfigRepository.upsertCredential({
      provider: PaymentProviderName.PAYFAST,
      merchantIdentifier: 'merchant-routed',
      merchantName: 'Routed Merchant',
      updatedAt: new Date()
    });
    await providerConfigRepository.upsertCredential({
      provider: PaymentProviderName.PAYU,
      merchantIdentifier: 'merchant-routed',
      merchantName: 'Routed Merchant',
      updatedAt: new Date()
    });

    await providerConfigRepository.upsertRoutingRule({
      id: 'rule-1',
      merchantIdentifier: 'merchant-routed',
      routeToProvider: PaymentProviderName.PAYFAST,
      priority: 0,
      enabled: true,
      updatedAt: new Date()
    });
    await providerConfigRepository.upsertRoutingRule({
      id: 'rule-2',
      merchantIdentifier: 'merchant-routed',
      routeToProvider: PaymentProviderName.PAYU,
      priority: 1,
      enabled: true,
      updatedAt: new Date()
    });

    const payment = await service.authorizePayment(
      {
        merchantIdentifier: 'merchant-routed',
        amount: 120,
        currency: 'ZAR',
        idempotencyKey: 'idem-routed-1'
      },
      {}
    );

    expect(payment.provider).toBe(PaymentProviderName.PAYU);
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(payfastProvider.authorize).toHaveBeenCalledTimes(1);
    expect(payuProvider.authorize).toHaveBeenCalledTimes(1);
  });

  it('does not execute capture twice for the same effective request hash', async () => {
    const provider = createProviderStub(PaymentProviderName.PAYU, {
      capture: jest.fn().mockResolvedValue(createProviderResponse(PaymentProviderName.PAYU, PaymentStatus.CAPTURED))
    });
    const { service, paymentRepository } = createService({
      [PaymentProviderName.PAYU]: provider
    } as Record<PaymentProviderName, PaymentProvider>);

    await paymentRepository.create({
      id: 'payment-capture-1',
      provider: PaymentProviderName.PAYU,
      amount: 120,
      currency: 'ZAR',
      status: PaymentStatus.AUTHORIZED,
      providerReference: 'payu_ref_capture_1',
      idempotencyKey: 'idem-capture-1',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const first = await service.capturePayment('payment-capture-1', {});
    const second = await service.capturePayment('payment-capture-1', {});

    expect(first.status).toBe(PaymentStatus.CAPTURED);
    expect(second.status).toBe(PaymentStatus.CAPTURED);
    expect(provider.capture).toHaveBeenCalledTimes(1);
  });

  it('rejects reused initial idempotency keys when the request body changes', async () => {
    const provider = createProviderStub(PaymentProviderName.PAYU, {
      authorize: jest.fn().mockResolvedValue(createProviderResponse(PaymentProviderName.PAYU, PaymentStatus.PENDING))
    });
    const { service } = createService({
      [PaymentProviderName.PAYU]: provider
    });

    const first = await service.authorizePayment(
      {
        provider: PaymentProviderName.PAYU,
        amount: 100,
        currency: 'ZAR',
        idempotencyKey: 'idem-initial-conflict'
      },
      {}
    );

    expect(first.status).toBe(PaymentStatus.PENDING);

    await expect(
      service.authorizePayment(
        {
          provider: PaymentProviderName.PAYU,
          amount: 150,
          currency: 'ZAR',
          idempotencyKey: 'idem-initial-conflict'
        },
        {}
      )
    ).rejects.toMatchObject({
      name: 'ProviderOperationError',
      statusCode: 409,
      message: 'AUTHORIZE idempotency key was reused for a different request',
      code: 'IDEMPOTENCY_KEY_CONFLICT'
    });
  });

  it('resolves the PayU adapter using merchant-scoped Mongo credentials', async () => {
    const provider = createProviderStub(PaymentProviderName.PAYU, {
      authorize: jest.fn().mockResolvedValue(createProviderResponse(PaymentProviderName.PAYU, PaymentStatus.PENDING))
    });
    const payuFactory = jest.fn().mockReturnValue(provider);

    const { service, providerConfigRepository, merchantRepository } = createService({
      [PaymentProviderName.PAYU]: payuFactory
    });

    await merchantRepository.create({
      id: 'merchant-id-2',
      merchantIdentifier: 'merchant-payu-db',
      merchantName: 'Mongo PayU Merchant',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await providerConfigRepository.upsertCredential({
      provider: PaymentProviderName.PAYU,
      merchantIdentifier: 'merchant-payu-db',
      merchantName: 'Mongo PayU Merchant',
      payuCredentials: {
        username: 'mongo-user',
        password: 'mongo-password',
        safekey: 'mongo-safekey'
      },
      updatedAt: new Date()
    });

    const payment = await service.authorizePayment(
      {
        merchantIdentifier: 'merchant-payu-db',
        provider: PaymentProviderName.PAYU,
        amount: 100,
        currency: 'ZAR',
        idempotencyKey: 'idem-payu-db-1'
      },
      {}
    );

    expect(payment.provider).toBe(PaymentProviderName.PAYU);
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(payuFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        payuCredentials: expect.objectContaining({
          username: 'mongo-user',
          password: 'mongo-password',
          safekey: 'mongo-safekey'
        })
      })
    );
  });

  it('resolves the PayU adapter using the default Mongo credential scope when no merchant is provided', async () => {
    env.mongo.enabled = true;
    env.mongo.defaultMerchantIdentifier = 'local-default-merchant';

    const provider = createProviderStub(PaymentProviderName.PAYU, {
      authorize: jest.fn().mockResolvedValue(createProviderResponse(PaymentProviderName.PAYU, PaymentStatus.PENDING))
    });
    const payuFactory = jest.fn().mockReturnValue(provider);

    const { service, providerConfigRepository } = createService({
      [PaymentProviderName.PAYU]: payuFactory
    });

    await providerConfigRepository.upsertCredential({
      provider: PaymentProviderName.PAYU,
      merchantIdentifier: 'local-default-merchant',
      merchantName: 'Local Default Merchant',
      payuCredentials: {
        username: 'mongo-default-user',
        password: 'mongo-default-password',
        safekey: 'mongo-default-safekey'
      },
      updatedAt: new Date()
    });

    const payment = await service.authorizePayment(
      {
        provider: PaymentProviderName.PAYU,
        amount: 100,
        currency: 'ZAR',
        idempotencyKey: 'idem-payu-default-merchant'
      },
      {}
    );

    expect(payment.provider).toBe(PaymentProviderName.PAYU);
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(payuFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        payuCredentials: expect.objectContaining({
          username: 'mongo-default-user',
          password: 'mongo-default-password',
          safekey: 'mongo-default-safekey'
        })
      })
    );
  });

  it('persists one webhook audit record and one payment log for duplicate webhook deliveries', async () => {
    const provider = createProviderStub(PaymentProviderName.PAYU, {
      handleWebhook: jest.fn().mockResolvedValue({
        merchantReference: 'payment-webhook-1',
        providerReference: 'payu_ref_webhook_1',
        status: PaymentStatus.CAPTURED,
        responseHash: 'response-hash-1'
      })
    });

    const { service, paymentRepository, paymentLogRepository, webhookEventRepository } = createService({
      [PaymentProviderName.PAYU]: provider
    });

    await paymentRepository.create({
      id: 'payment-webhook-1',
      provider: PaymentProviderName.PAYU,
      amount: 120,
      currency: 'ZAR',
      status: PaymentStatus.PENDING,
      providerReference: 'payu_ref_webhook_1',
      idempotencyKey: 'idem-webhook-1',
      initialRequestHash: 'initial-request-hash-1',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await service.handleWebhook(PaymentProviderName.PAYU, '<xml>duplicate</xml>', '', '<xml>duplicate</xml>');
    await service.handleWebhook(PaymentProviderName.PAYU, '<xml>duplicate</xml>', '', '<xml>duplicate</xml>');

    const payment = await paymentRepository.findById('payment-webhook-1');
    expect(payment?.status).toBe(PaymentStatus.CAPTURED);

    const logs = await paymentLogRepository.listByPaymentId('payment-webhook-1');
    const webhookLogs = logs.filter((entry) => (entry.request as { operation?: string }).operation === 'webhook');
    expect(webhookLogs).toHaveLength(1);

    const webhookEvents = await webhookEventRepository.listByPaymentId('payment-webhook-1');
    expect(webhookEvents).toHaveLength(1);
    expect(webhookEvents[0]).toMatchObject({
      provider: PaymentProviderName.PAYU,
      responseHash: 'response-hash-1',
      state: 'SUCCEEDED',
      rawPayload: '<xml>duplicate</xml>'
    });
  });
});
describe('PaymentService provider refresh on reads', () => {
  it('refreshes provider state when fetching a payment by id', async () => {
    const provider: PaymentProvider = {
      payment: jest.fn(),
      authorize: jest.fn(),
      capture: jest.fn(),
      refund: jest.fn(),
      void: jest.fn(),
      lookupTransaction: jest.fn().mockResolvedValue({
        providerReference: 'payflex_order_1',
        payuReference: 'payflex_order_1',
        merchantReference: 'payment_read_1',
        transactionState: 'Approved',
        transactionType: 'ORDER',
        status: PaymentStatus.CAPTURED,
        amountInCents: 12000,
        currency: 'ZAR',
        resultCode: '200',
        resultMessage: 'Approved'
      }),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      handleWebhook: jest.fn().mockResolvedValue(null)
    };

    const { service, paymentRepository, paymentLogRepository } = createService({
      [PaymentProviderName.PAYFLEX]: provider
    });

    await paymentRepository.create({
      id: 'payment_read_1',
      provider: PaymentProviderName.PAYFLEX,
      amount: 120,
      currency: 'ZAR',
      status: PaymentStatus.PENDING,
      providerReference: 'payflex_order_1',
      idempotencyKey: 'idem-read-1',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const payment = await service.getPayment('payment_read_1', { 'x-request-id': 'req-1' });

    expect(payment?.status).toBe(PaymentStatus.CAPTURED);
    expect(provider.lookupTransaction).toHaveBeenCalledWith({
      providerReference: 'payflex_order_1',
      payuReference: 'payflex_order_1',
      merchantReference: 'payment_read_1'
    });

    const logs = await paymentLogRepository.listByPaymentId('payment_read_1');
    expect(logs).toHaveLength(1);
    expect(logs[0].request).toMatchObject({ operation: 'payment-read' });
  });

  it('refreshes provider state for payments returned by the transaction list', async () => {
    const provider: PaymentProvider = {
      payment: jest.fn(),
      authorize: jest.fn(),
      capture: jest.fn(),
      refund: jest.fn(),
      void: jest.fn(),
      lookupTransaction: jest.fn().mockResolvedValue({
        providerReference: 'payflex_order_2',
        payuReference: 'payflex_order_2',
        merchantReference: 'payment_read_2',
        transactionState: 'Approved',
        transactionType: 'ORDER',
        status: PaymentStatus.CAPTURED,
        amountInCents: 19900,
        currency: 'ZAR',
        resultCode: '200',
        resultMessage: 'Approved'
      }),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      handleWebhook: jest.fn().mockResolvedValue(null)
    };

    const { service, paymentRepository, paymentLogRepository } = createService({
      [PaymentProviderName.PAYFLEX]: provider
    });

    await paymentRepository.create({
      id: 'payment_read_2',
      provider: PaymentProviderName.PAYFLEX,
      amount: 199,
      currency: 'ZAR',
      status: PaymentStatus.PENDING,
      providerReference: 'payflex_order_2',
      idempotencyKey: 'idem-read-2',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const payments = await service.listTransactions({ 'x-request-id': 'req-2' });

    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe(PaymentStatus.CAPTURED);
    expect(provider.lookupTransaction).toHaveBeenCalledTimes(1);

    const logs = await paymentLogRepository.listByPaymentId('payment_read_2');
    expect(logs).toHaveLength(1);
    expect(logs[0].request).toMatchObject({ operation: 'transactions-read' });
  });
});
