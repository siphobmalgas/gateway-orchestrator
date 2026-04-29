import { randomUUID } from 'crypto';
import { PaymentProviderName } from '../domain/enums';
import { Merchant } from '../domain/merchant.entity';
import { MerchantRepository } from '../infrastructure/repositories/merchant.repository';
import {
  ApiKeyCredentials,
  PayFlexCredentials,
  PayUCredentials,
  ProviderConfigRepository,
  RoutingRule
} from '../infrastructure/repositories/provider-config.repository';

export interface RegisterProviderInput {
  provider: PaymentProviderName;
  merchantIdentifier: string;
  merchantName: string;
  payuCredentials?: PayUCredentials;
  payflexCredentials?: PayFlexCredentials;
  payfastCredentials?: ApiKeyCredentials;
  stitchCredentials?: ApiKeyCredentials;
  peachCredentials?: ApiKeyCredentials;
  metadata?: Record<string, unknown>;
}

export interface CreateMerchantInput {
  merchantIdentifier: string;
  merchantName: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UpsertRoutingRuleInput {
  id?: string;
  merchantIdentifier: string;
  routeToProvider: PaymentProviderName;
  priority: number;
  paymentMethod?: string;
  currency?: string;
  country?: string;
  enabled?: boolean;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export class OnboardingService {
  constructor(
    private readonly providerConfigRepository: ProviderConfigRepository,
    private readonly merchantRepository: MerchantRepository
  ) {}

  private assertProviderCredentials(input: RegisterProviderInput): void {
    switch (input.provider) {
      case PaymentProviderName.PAYU:
        if (!input.payuCredentials) {
          throw new Error('PAYU credentials are required for provider registration');
        }
        return;
      case PaymentProviderName.PAYFLEX:
        if (!input.payflexCredentials) {
          throw new Error('PAYFLEX credentials are required for provider registration');
        }
        return;
      case PaymentProviderName.PAYFAST:
        if (!input.payfastCredentials) {
          throw new Error('PAYFAST credentials are required for provider registration');
        }
        return;
      case PaymentProviderName.STITCH:
        if (!input.stitchCredentials) {
          throw new Error('STITCH credentials are required for provider registration');
        }
        return;
      case PaymentProviderName.PEACH:
        if (!input.peachCredentials) {
          throw new Error('PEACH credentials are required for provider registration');
        }
        return;
      default:
        return;
    }
  }

  async registerProvider(input: RegisterProviderInput): Promise<{ registered: boolean; provider: PaymentProviderName }> {
    this.assertProviderCredentials(input);

    await this.providerConfigRepository.upsertCredential({
      provider: input.provider,
      merchantIdentifier: input.merchantIdentifier,
      merchantName: input.merchantName,
      payuCredentials: input.payuCredentials,
      payflexCredentials: input.payflexCredentials,
      payfastCredentials: input.payfastCredentials,
      stitchCredentials: input.stitchCredentials,
      peachCredentials: input.peachCredentials,
      updatedAt: new Date(),
      metadata: input.metadata
    });

    return {
      registered: true,
      provider: input.provider
    };
  }

  async createMerchant(input: CreateMerchantInput): Promise<Merchant> {
    const existing = await this.merchantRepository.findByMerchantIdentifier(input.merchantIdentifier);
    if (existing) {
      return existing;
    }

    const merchant: Merchant = {
      id: randomUUID(),
      merchantIdentifier: input.merchantIdentifier,
      merchantName: input.merchantName,
      webhookUrl: input.webhookUrl,
      metadata: input.metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.merchantRepository.create(merchant);
    return merchant;
  }

  async getMerchant(merchantIdentifier: string): Promise<Merchant | null> {
    return this.merchantRepository.findByMerchantIdentifier(merchantIdentifier);
  }

  async updateMerchantWebhookUrl(merchantIdentifier: string, webhookUrl: string | null): Promise<Merchant> {
    const merchant = await this.merchantRepository.findByMerchantIdentifier(merchantIdentifier);
    if (!merchant) {
      throw new Error(`Merchant not found: ${merchantIdentifier}`);
    }

    merchant.webhookUrl = webhookUrl ?? undefined;
    merchant.updatedAt = new Date();
    await this.merchantRepository.update(merchant);
    return merchant;
  }

  async upsertRoutingRule(input: UpsertRoutingRuleInput): Promise<RoutingRule> {
    const merchant = await this.merchantRepository.findByMerchantIdentifier(input.merchantIdentifier);
    if (!merchant) {
      throw new Error(`Merchant not found: ${input.merchantIdentifier}`);
    }

    const rule: RoutingRule = {
      id: input.id ?? randomUUID(),
      merchantIdentifier: input.merchantIdentifier,
      routeToProvider: input.routeToProvider,
      priority: input.priority,
      paymentMethod: input.paymentMethod,
      currency: input.currency,
      country: input.country,
      enabled: input.enabled ?? true,
      weight: input.weight,
      metadata: input.metadata,
      updatedAt: new Date()
    };

    await this.providerConfigRepository.upsertRoutingRule(rule);
    return rule;
  }

  async listRoutingRules(merchantIdentifier?: string): Promise<RoutingRule[]> {
    return this.providerConfigRepository.listRoutingRules(merchantIdentifier);
  }
}
