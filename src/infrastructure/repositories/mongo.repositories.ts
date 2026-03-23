import { randomUUID } from 'crypto';
import { Collection } from 'mongodb';
import { Merchant } from '../../domain/merchant.entity';
import { Payment } from '../../domain/payment.entity';
import { logger } from '../logger';
import { getMongoDb } from '../db/mongo.client';
import { PaymentLog, PaymentLogRepository } from './payment-log.repository';
import { MerchantRepository } from './merchant.repository';
import { PaymentRepository } from './payment.repository';
import { ProviderConfigRepository, ProviderCredential, RoutingRule } from './provider-config.repository';

const initIndexes = async (): Promise<void> => {
  const db = await getMongoDb();

  await db.collection('payments').createIndex({ id: 1 }, { unique: true });
  await db.collection('payments').createIndex({ idempotencyKey: 1 }, { unique: true });
  await db.collection('payment_logs').createIndex({ paymentId: 1 });
  await db.collection('provider_credentials').createIndex({ provider: 1 }, { unique: true });
  await db.collection('routing_rules').createIndex({ id: 1 }, { unique: true });
  await db.collection('routing_rules').createIndex({ provider: 1, priority: 1 });
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

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    const collection = await this.collection();
    const payment = await collection.findOne({ idempotencyKey });
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
      { provider: credential.provider },
      {
        $set: {
          ...credential,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  async getCredential(provider: string): Promise<ProviderCredential | null> {
    const collection = await this.credentialsCollection();
    const credential = await collection.findOne({ provider });
    return credential ? sanitizeMongoDoc(credential as ProviderCredential & { _id: unknown }) : null;
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

  async listRoutingRules(): Promise<RoutingRule[]> {
    const collection = await this.routingCollection();
    const rules = await collection.find({ enabled: true }).sort({ priority: 1 }).toArray();
    return rules.map((item) => sanitizeMongoDoc(item as RoutingRule & { _id: unknown }));
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
