import { Payment } from '../../domain/payment.entity';

export interface PaymentRepository {
  create(payment: Payment): Promise<void>;
  findById(id: string): Promise<Payment | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null>;
  listAll(): Promise<Payment[]>;
  update(payment: Payment): Promise<void>;
}
