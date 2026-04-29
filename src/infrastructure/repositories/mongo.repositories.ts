import { randomUUID } from 'crypto';
import { Collection, Filter } from 'mongodb';
import { Merchant } from '../../domain/merchant.entity';
import { PaymentProviderName } from '../../domain/enums';
import { PaymentOperation, PaymentOperationType } from '../../domain/payment-operation.entity';
import { Payment } from '../../domain/payment.entity';
import { WebhookEventRecord } from '../../domain/webhook-event.entity';
import { logger } from '../logger';
import { getMongoDb } from '../db/mongo.client';
import { PaymentLog, PaymentLogRepository } from './payment-log.repository';
import { MerchantRepository } from './merchant.repository';
import { PaymentOperationRepository } from './payment-operation.repository';
import { PaymentRepository } from './payment.repository';
import { ProviderConfigRepository, ProviderCredential, RoutingRule } from './provider-config.repository';
import { WebhookEventRepository } from './webhook-event.repository';

const initIndexes = async (): Promise<void> => {
  const db = await getMongoDb();

  await db.collection('payments').dropIndex('idempotencyKey_1').catch(() => undefined);
  await db.collection('provider_credentials').dropIndex('provider_1').catch(() => undefined);
  await db.collection('payments').createIndex({ id: 1 }, { unique: true });
  await db.collection('payments').createIndex({ merchantIdentifier: 1, idempotencyKey: 1 }, { unique: true });
  await db.collection('payment_logs').createIndex({ paymentId: 1 });
  await db.collection('payment_operations').createIndex({ paymentId: 1, type: 1, idempotencyKey: 1 }, { unique: true });
  await db.collection('webhook_events').createIndex({ dedupeKey: 1 }, { unique: true });
  await db.collection('webhook_events').createIndex({ paymentId: 1, createdAt: -1 });
  await db.collection('provider_credentials').createIndex({ merchantIdentifier: 1, provider: 1 }, { unique: true });
  await db.collection('routing_rules').createIndex({ id: 1 }, { unique: true });
  await db.collection('routing_rules').createIndex({ merchantIdentifier: 1, priority: 1 });
  await db.collection('merchants').createIndex({ merchantIdentifier: 1 }, { unique: true });
};

let indexInitPromise: Promise<void> | null = null;

const ensureIndexes = async (): Promise<void> => {
  if (!indexInitPromise) {
    indexInitPromise = initIndexes().catch((error: unknown) => {
      logger.error('Mongo index initialization failed', {
        message: error instanceof Error ? error.message : 'Unknown mongo index error'
      });
      throw error;
    });
  }

  await indexInitPromise;
};

const sanitizeMongoDoc = <T extends { _id?: unknown }>(doc: T): Omit<T, '_id'> => {
  const { _id, ...rest } = doc;
  return rest;
};

export class MongoPaymentRepository implements PaymentRepository {
  private async collection(): Promise<Collection<Payment>> {
    await ensureIndexes();
    const db = await getMongoDb();
    return db.collection<Payment>('payments');
  }

  async create(payment: Payment): Promise<void> {
    const collection = await this.collection();
    await collection.insertOne(payment);
  }

  async findById(id: string): Promise<Payment | null> {
    const collection = await this.collection();
    const payment = await collection.findOne({ id });
    return payment ? sanitizeMongoDoc(payment as Payment & { _id: unknown }) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string, merchantIdentifier?: string): Promise<Payment | null> {
    const collection = await this.collection();
    const filter: Filter<Payment> =
      merchantIdentifier === undefined
        ? { idempotencyKey, merchantIdentifier: { $exists: false } }
        : { idempotencyKey, merchantIdentifier };
    const payment = await collection.findOne(filter);
    return payment ? sanitizeMongoDoc(payment as Payment & { _id: unknown }) : null;
  }

  async update(payment: Payment): Promise<void> {
    const collection = await this.collection();
    await collection.updateOne({ id: payment.id }, { $set: payment }, { upsert: false });
  }

  async listAll(): Promise<Payment[]> {
    const collection = await this.collection();
    const payments = await collection.find({}).sort({ createdAt: -1 }).toArray();
    return payments.map((item) => sanitizeMongoDoc(item as Payment & { _id: unknown }));
  }
}

export class MongoPaymentLogRepository implements PaymentLogRepository {
  private async collection(): Promise<Collection<PaymentLog>> {
    await ensureIndexes();
    const db = await getMongoDb();
    return db.collection<PaymentLog>('payment_logs');
  }

  async create(log: PaymentLog): Promise<void> {
    const collection = await this.collection();
    await collection.insertOne(log);
  }

  async listByPaymentId(paymentId: string): Promise<PaymentLog[]> {
    const collection = await this.collection();
    const logs = await collection.find({ paymentId }).sort({ createdAt: -1 }).toArray();
    return logs.map((item) => sanitizeMongoDoc(item as PaymentLog & { _id: unknown }));
  }
}

export class MongoProviderConfigRepository implements ProviderConfigRepository {
  private async credentialsCollection(): Promise<Collection<ProviderCredential>> {
    await ensureIndexes();
    const db = await getMongoDb();
    return db.collection<ProviderCredential>('provider_credentials');
  }

  private async routingCollection(): Promise<Collection<RoutingRule>> {
    await ensureIndexes();
    const db = await getMongoDb();
    return db.collection<RoutingRule>('routing_rules');
  }

  async upsertCredential(credential: ProviderCredential): Promise<void> {
    const collection = await this.credentialsCollection();
    await collection.updateOne(
      { merchantIdentifier: credential.merchantIdentifier, provider: credential.provider },
      {
        $set: {
          ...credential,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  async getCredential(merchantIdentifier: string, provider: PaymentProviderName): Promise<ProviderCredential | null> {
    const collection = await this.credentialsCollection();
    const credential = await collection.findOne({ merchantIdentifier, provider });
    return credential ? sanitizeMongoDoc(credential as ProviderCredential & { _id: unknown }) : null;
  }

  async listCredentialsByMerchant(merchantIdentifier: string): Promise<ProviderCredential[]> {
    const collection = await this.credentialsCollection();
    const credentials = await collection.find({ merchantIdentifier }).toArray();
    return credentials.map((item) => sanitizeMongoDoc(item as ProviderCredential & { _id: unknown }));
  }

  async upsertRoutingRule(rule: RoutingRule): Promise<void> {
    const collection = await this.routingCollection();
    const id = rule.id || randomUUID();

    await collection.updateOne(
      { id },
      {
        $set: {
          ...rule,
          id,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  async listRoutingRules(merchantIdentifier?: string): Promise<RoutingRule[]> {
    const collection = await this.routingCollection();
    const filter = merchantIdentifier ? { merchantIdentifier, enabled: true } : { enabled: true };
    const rules = await collection.find(filter).sort({ priority: 1 }).toArray();
    return rules.map((item) => sanitizeMongoDoc(item as RoutingRule & { _id: unknown }));
  }
}

export class MongoPaymentOperationRepository implements PaymentOperationRepository {
  private async collection(): Promise<Collection<PaymentOperation>> {
    await ensureIndexes();
    const db = await getMongoDb();
    return db.collection<PaymentOperation>('payment_operations');
  }

  async create(operation: PaymentOperation): Promise<void> {
    const collection = await this.collection();
    await collection.insertOne(operation);
  }

  async findByIdempotencyKey(paymentId: string, type: PaymentOperationType, idempotencyKey: string): Promise<PaymentOperation | null> {
    const collection = await this.collection();
    const operation = await collection.findOne({ paymentId, type, idempotencyKey });
    return operation ? sanitizeMongoDoc(operation as PaymentOperation & { _id: unknown }) : null;
  }

  async listByPaymentId(paymentId: string): Promise<PaymentOperation[]> {
    const collection = await this.collection();
    const operations = await collection.find({ paymentId }).sort({ createdAt: -1 }).toArray();
    return operations.map((item) => sanitizeMongoDoc(item as PaymentOperation & { _id: unknown }));
  }

  async update(operation: PaymentOperation): Promise<void> {
    const collection = await this.collection();
    await collection.updateOne(
      { paymentId: operation.paymentId, type: operation.type, idempotencyKey: operation.idempotencyKey },
      { $set: operation },
      { upsert: false }
    );
  }
}

export class MongoWebhookEventRepository implements WebhookEventRepository {
  private async collection(): Promise<Collection<WebhookEventRecord>> {
    await ensureIndexes();
    const db = await getMongoDb();
    return db.collection<WebhookEventRecord>('webhook_events');
  }

  async create(record: WebhookEventRecord): Promise<void> {
    const collection = await this.collection();
    await collection.insertOne(record);
  }

  async findByDedupeKey(dedupeKey: string): Promise<WebhookEventRecord | null> {
    const collection = await this.collection();
    const record = await collection.findOne({ dedupeKey });
    return record ? sanitizeMongoDoc(record as WebhookEventRecord & { _id: unknown }) : null;
  }

  async listByPaymentId(paymentId: string): Promise<WebhookEventRecord[]> {
    const collection = await this.collection();
    const records = await collection.find({ paymentId }).sort({ createdAt: -1 }).toArray();
    return records.map((item) => sanitizeMongoDoc(item as WebhookEventRecord & { _id: unknown }));
  }

  async update(record: WebhookEventRecord): Promise<void> {
    const collection = await this.collection();
    await collection.updateOne({ dedupeKey: record.dedupeKey }, { $set: record }, { upsert: false });
  }
}

export class MongoMerchantRepository implements MerchantRepository {
  private async collection(): Promise<Collection<Merchant>> {
    await ensureIndexes();
    const db = await getMongoDb();
    return db.collection<Merchant>('merchants');
  }

  async create(merchant: Merchant): Promise<void> {
    const collection = await this.collection();
    await collection.insertOne(merchant);
  }

  async findByMerchantIdentifier(merchantIdentifier: string): Promise<Merchant | null> {
    const collection = await this.collection();
    const merchant = await collection.findOne({ merchantIdentifier });
    return merchant ? sanitizeMongoDoc(merchant as Merchant & { _id: unknown }) : null;
  }
}
