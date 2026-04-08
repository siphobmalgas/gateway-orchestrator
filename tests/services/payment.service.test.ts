import { PaymentProviderName, PaymentStatus } from '../../src/domain/enums';
import { PaymentProvider, PaymentResponse } from '../../src/domain/provider.interface';
import { ProviderOperationError } from '../../src/errors/provider-operation.error';
import { InMemoryPaymentLogRepository, InMemoryPaymentRepository } from '../../src/infrastructure/repositories/in-memory.repositories';
import { PaymentService } from '../../src/services/payment.service';

const createProviderResponse = (status: PaymentStatus, rawResponse?: unknown): PaymentResponse => ({
  provider: PaymentProviderName.PAYU,
  providerReference: 'payu_ref_1',
  amount: 120,
  currency: 'ZAR',
  status,
  rawResponse
});

describe('PaymentService provider operation failures', () => {
  it('throws a provider error with the PayU reason and preserves the stored status on failed capture', async () => {
    const provider: PaymentProvider = {
      payment: jest.fn(),
      authorize: jest.fn(),
      capture: jest.fn().mockResolvedValue(
        createProviderResponse(PaymentStatus.FAILED, {
          result: {
            resultCode: 'P022',
            resultMessage: 'Transaction is not in the correct state - last transaction: FINALIZE state: SUCCESSFUL',
            displayMessage: 'An error occurred with this payment, please contact your merchant (ref: P022)',
            pointOfFailure: 'PAYU'
          }
        })
      ),
      refund: jest.fn(),
      void: jest.fn(),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      handleWebhook: jest.fn().mockResolvedValue(null)
    };

    const paymentRepository = new InMemoryPaymentRepository();
    const paymentLogRepository = new InMemoryPaymentLogRepository();
    const service = new PaymentService({ [PaymentProviderName.PAYU]: provider } as Record<PaymentProviderName, PaymentProvider>, paymentRepository, paymentLogRepository);

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
    const provider: PaymentProvider = {
      payment: jest.fn(),
      authorize: jest.fn(),
      capture: jest.fn(),
      refund: jest.fn().mockResolvedValue(
        createProviderResponse(PaymentStatus.FAILED, {
          result: {
            resultCode: 'P019',
            resultMessage: 'Transaction amount must be equal to less than original transaction amount',
            displayMessage: 'An error occurred with this payment, please contact your merchant (ref: P019)',
            pointOfFailure: 'PAYU'
          }
        })
      ),
      void: jest.fn(),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      handleWebhook: jest.fn().mockResolvedValue(null)
    };

    const paymentRepository = new InMemoryPaymentRepository();
    const paymentLogRepository = new InMemoryPaymentLogRepository();
    const service = new PaymentService({ [PaymentProviderName.PAYU]: provider } as Record<PaymentProviderName, PaymentProvider>, paymentRepository, paymentLogRepository);

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
    const provider: PaymentProvider = {
      payment: jest.fn(),
      authorize: jest.fn(),
      capture: jest.fn(),
      refund: jest.fn(),
      void: jest.fn().mockResolvedValue(
        createProviderResponse(PaymentStatus.FAILED, {
          result: {
            resultCode: 'P022',
            resultMessage: 'Transaction is not in the correct state - last transaction: RESERVE_CANCEL state: SUCCESSFUL',
            displayMessage: 'An error occurred with this payment, please contact your merchant (ref: P022)',
            pointOfFailure: 'PAYU'
          }
        })
      ),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      handleWebhook: jest.fn().mockResolvedValue(null)
    };

    const paymentRepository = new InMemoryPaymentRepository();
    const paymentLogRepository = new InMemoryPaymentLogRepository();
    const service = new PaymentService({ [PaymentProviderName.PAYU]: provider } as Record<PaymentProviderName, PaymentProvider>, paymentRepository, paymentLogRepository);

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