import { randomUUID } from 'crypto';
import { PaymentProviderName } from '../domain/enums';
import { Merchant } from '../domain/merchant.entity';
import { MerchantRepository } from '../infrastructure/repositories/merchant.repository';
import { PayUCredentials, ProviderConfigRepository } from '../infrastructure/repositories/provider-config.repository';

export interface RegisterProviderInput {
  provider: PaymentProviderName;
  merchantIdentifier: string;
  merchantName: string;
  payuCredentials?: PayUCredentials;
  metadata?: Record<string, unknown>;
}

export interface CreateMerchantInput {
  merchantIdentifier: string;
  merchantName: string;
  metadata?: Record<string, unknown>;
}

export class OnboardingService {
  constructor(
    private readonly providerConfigRepository: ProviderConfigRepository,
    private readonly merchantRepository: MerchantRepository
  ) {}

  async registerProvider(input: RegisterProviderInput): Promise<{ registered: boolean; provider: PaymentProviderName }> {
    if (input.provider === PaymentProviderName.PAYU && !input.payuCredentials) {
      throw new Error('PAYU credentials are required for provider registration');
    }

    await this.providerConfigRepository.upsertCredential({
      provider: input.provider,
      merchantIdentifier: input.merchantIdentifier,
      merchantName: input.merchantName,
      payuCredentials: input.payuCredentials,
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
      metadata: input.metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.merchantRepository.create(merchant);
    return merchant;
  }
}
