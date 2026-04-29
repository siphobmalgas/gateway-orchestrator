import { PaymentStatus } from '../../domain/enums';
import { Payment } from '../../domain/payment.entity';

export interface PaymentRepository {
  create(payment: Payment): Promise<void>;
  findById(id: string): Promise<Payment | null>;
  findByIdempotencyKey(idempotencyKey: string, merchantIdentifier?: string): Promise<Payment | null>;
  findByStatuses(statuses: PaymentStatus[]): Promise<Payment[]>;
  listAll(): Promise<Payment[]>;
  update(payment: Payment): Promise<void>;
}
