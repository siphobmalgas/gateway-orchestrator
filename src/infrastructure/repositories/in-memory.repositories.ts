import { Payment } from '../../domain/payment.entity';
import { PaymentOperation } from '../../domain/payment-operation.entity';
import { WebhookEventRecord } from '../../domain/webhook-event.entity';
import { Merchant } from '../../domain/merchant.entity';
import { PaymentLog, PaymentLogRepository } from './payment-log.repository';
import { MerchantRepository } from './merchant.repository';
import { PaymentOperationRepository } from './payment-operation.repository';
import { PaymentRepository } from './payment.repository';
import { ProviderConfigRepository, ProviderCredential, RoutingRule } from './provider-config.repository';
import { WebhookEventRepository } from './webhook-event.repository';

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly store = new Map<string, Payment>();

  async create(payment: Payment): Promise<void> {
    this.store.set(payment.id, payment);
  }

  async findById(id: string): Promise<Payment | null> {
    return this.store.get(id) ?? null;
  }

  async findByIdempotencyKey(idempotencyKey: string, merchantIdentifier?: string): Promise<Payment | null> {
    for (const payment of this.store.values()) {
      if (payment.idempotencyKey === idempotencyKey && payment.merchantIdentifier === merchantIdentifier) {
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

  private credentialKey(merchantIdentifier: string, provider: string): string {
    return `${merchantIdentifier}:${provider}`;
  }

  async upsertCredential(credential: ProviderCredential): Promise<void> {
    this.credentials.set(this.credentialKey(credential.merchantIdentifier, credential.provider), {
      ...credential,
      updatedAt: new Date()
    });
  }

  async getCredential(merchantIdentifier: string, provider: string): Promise<ProviderCredential | null> {
    return this.credentials.get(this.credentialKey(merchantIdentifier, provider)) ?? null;
  }

  async listCredentialsByMerchant(merchantIdentifier: string): Promise<ProviderCredential[]> {
    return Array.from(this.credentials.values()).filter((credential) => credential.merchantIdentifier === merchantIdentifier);
  }

  async upsertRoutingRule(rule: RoutingRule): Promise<void> {
    this.routingRules.set(rule.id, {
      ...rule,
      updatedAt: new Date()
    });
  }

  async listRoutingRules(merchantIdentifier?: string): Promise<RoutingRule[]> {
    return Array.from(this.routingRules.values())
      .filter((rule) => (merchantIdentifier ? rule.merchantIdentifier === merchantIdentifier : true))
      .filter((rule) => rule.enabled)
      .sort((a, b) => a.priority - b.priority);
  }
}

export class InMemoryPaymentOperationRepository implements PaymentOperationRepository {
  private readonly operations = new Map<string, PaymentOperation>();

  private operationKey(paymentId: string, type: string, idempotencyKey: string): string {
    return `${paymentId}:${type}:${idempotencyKey}`;
  }

  async create(operation: PaymentOperation): Promise<void> {
    this.operations.set(this.operationKey(operation.paymentId, operation.type, operation.idempotencyKey), operation);
  }

  async findByIdempotencyKey(paymentId: string, type: string, idempotencyKey: string): Promise<PaymentOperation | null> {
    return this.operations.get(this.operationKey(paymentId, type, idempotencyKey)) ?? null;
  }

  async listByPaymentId(paymentId: string): Promise<PaymentOperation[]> {
    return Array.from(this.operations.values())
      .filter((operation) => operation.paymentId === paymentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async update(operation: PaymentOperation): Promise<void> {
    this.operations.set(this.operationKey(operation.paymentId, operation.type, operation.idempotencyKey), operation);
  }
}

export class InMemoryWebhookEventRepository implements WebhookEventRepository {
  private readonly records = new Map<string, WebhookEventRecord>();

  async create(record: WebhookEventRecord): Promise<void> {
    this.records.set(record.dedupeKey, record);
  }

  async findByDedupeKey(dedupeKey: string): Promise<WebhookEventRecord | null> {
    return this.records.get(dedupeKey) ?? null;
  }

  async listByPaymentId(paymentId: string): Promise<WebhookEventRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => record.paymentId === paymentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async update(record: WebhookEventRecord): Promise<void> {
    this.records.set(record.dedupeKey, record);
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
