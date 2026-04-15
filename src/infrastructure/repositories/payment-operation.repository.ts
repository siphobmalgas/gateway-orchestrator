import { PaymentOperation, PaymentOperationType } from '../../domain/payment-operation.entity';

export interface PaymentOperationRepository {
  create(operation: PaymentOperation): Promise<void>;
  findByIdempotencyKey(paymentId: string, type: PaymentOperationType, idempotencyKey: string): Promise<PaymentOperation | null>;
  listByPaymentId(paymentId: string): Promise<PaymentOperation[]>;
  update(operation: PaymentOperation): Promise<void>;
}