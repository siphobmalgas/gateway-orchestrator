import { Payment } from '../../domain/payment.entity';
import { Merchant } from '../../domain/merchant.entity';
import { PaymentLog, PaymentLogRepository } from './payment-log.repository';
import { MerchantRepository } from './merchant.repository';
import { PaymentRepository } from './payment.repository';
import { ProviderConfigRepository, ProviderCredential, RoutingRule } from './provider-config.repository';

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly store = new Map<string, Payment>();

  async create(payment: Payment): Promise<void> {
    this.store.set(payment.id, payment);
  }

  async findById(id: string): Promise<Payment | null> {
    return this.store.get(id) ?? null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    for (const payment of this.store.values()) {
      if (payment.idempotencyKey === idempotencyKey) {
        return payment;
      }
    }
    return null;
  }

  async listAll(): Promise<Payment[]> {
    return Array.from(this.store.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async update(payment: Payment): Promise<void> {
    this.store.set(payment.id, payment);
  }
}

export class InMemoryPaymentLogRepository implements PaymentLogRepository {
  private readonly logs = new Map<string, PaymentLog[]>();

  async create(log: PaymentLog): Promise<void> {
    const existing = this.logs.get(log.paymentId) ?? [];
    existing.push(log);
    this.logs.set(log.paymentId, existing);
  }

  async listByPaymentId(paymentId: string): Promise<PaymentLog[]> {
    return this.logs.get(paymentId) ?? [];
  }
}

export class InMemoryProviderConfigRepository implements ProviderConfigRepository {
  private readonly credentials = new Map<string, ProviderCredential>();
  private readonly routingRules = new Map<string, RoutingRule>();

  async upsertCredential(credential: ProviderCredential): Promise<void> {
    this.credentials.set(credential.provider, {
      ...credential,
      updatedAt: new Date()
    });
  }

  async getCredential(provider: string): Promise<ProviderCredential | null> {
    return this.credentials.get(provider) ?? null;
  }

  async upsertRoutingRule(rule: RoutingRule): Promise<void> {
    this.routingRules.set(rule.id, {
      ...rule,
      updatedAt: new Date()
    });
  }

  async listRoutingRules(): Promise<RoutingRule[]> {
    return Array.from(this.routingRules.values())
      .filter((rule) => rule.enabled)
      .sort((a, b) => a.priority - b.priority);
  }
}

export class InMemoryMerchantRepository implements MerchantRepository {
  private readonly merchants = new Map<string, Merchant>();

  async create(merchant: Merchant): Promise<void> {
    this.merchants.set(merchant.merchantIdentifier, merchant);
  }

  async findByMerchantIdentifier(merchantIdentifier: string): Promise<Merchant | null> {
    return this.merchants.get(merchantIdentifier) ?? null;
  }
}
