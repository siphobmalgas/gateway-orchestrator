export interface PaymentLog {
  id: string;
  paymentId: string;
  provider: string;
  request: unknown;
  response: unknown;
  headers: Record<string, string | string[] | undefined>;
  responseTimeMs: number;
  createdAt: Date;
}

export interface PaymentLogRepository {
  create(log: PaymentLog): Promise<void>;
  listByPaymentId(paymentId: string): Promise<PaymentLog[]>;
}
