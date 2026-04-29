import { PaymentProviderName } from '../domain/enums';
import { logger } from '../infrastructure/logger';
import { MerchantRepository } from '../infrastructure/repositories/merchant.repository';
import { ProviderConfigRepository, ProviderCredential } from '../infrastructure/repositories/provider-config.repository';

export interface ResolveProviderCandidatesInput {
  merchantIdentifier?: string;
  explicitProvider?: PaymentProviderName;
  paymentMethod?: string;
  currency: string;
}

export interface ProviderCandidate {
  provider: PaymentProviderName;
  credential?: ProviderCredential;
  ruleId?: string;
  priority: number;
}

export class RoutingService {
  constructor(
    private readonly providerConfigRepository: ProviderConfigRepository,
    private readonly merchantRepository: MerchantRepository
  ) {}

  async resolveCandidates(input: ResolveProviderCandidatesInput): Promise<ProviderCandidate[]> {
    if (input.merchantIdentifier) {
      const merchant = await this.merchantRepository.findByMerchantIdentifier(input.merchantIdentifier);
      if (!merchant) {
        throw new Error(`Merchant not found: ${input.merchantIdentifier}`);
      }

      const rules = await this.providerConfigRepository.listRoutingRules(input.merchantIdentifier);
      const filteredRules = rules.filter((rule) => {
        if (rule.currency && rule.currency !== input.currency) {
          return false;
        }

        if (rule.paymentMethod && rule.paymentMethod !== input.paymentMethod) {
          return false;
        }

        return true;
      });

      if (filteredRules.length > 0) {
        const candidates: ProviderCandidate[] = [];

        for (const rule of filteredRules) {
          const credential = await this.providerConfigRepository.getCredential(input.merchantIdentifier, rule.routeToProvider);
          if (!credential) {
            logger.warn('Skipping routing rule because provider credential is not registered for merchant', {
              merchantIdentifier: input.merchantIdentifier,
              provider: rule.routeToProvider,
              ruleId: rule.id
            });
            continue;
          }

          candidates.push({
            provider: rule.routeToProvider,
            credential,
            ruleId: rule.id,
            priority: rule.priority
          });
        }

        if (candidates.length > 0) {
          return candidates;
        }

        throw new Error(`No registered providers available for merchant routing: ${input.merchantIdentifier}`);
      }

      if (input.explicitProvider) {
        const credential = await this.providerConfigRepository.getCredential(input.merchantIdentifier, input.explicitProvider);
        if (!credential) {
          throw new Error(`Provider ${input.explicitProvider} is not registered for merchant ${input.merchantIdentifier}`);
        }

        return [
          {
            provider: input.explicitProvider,
            credential,
            priority: 0
          }
        ];
      }

      throw new Error(`No routing rules configured for merchant ${input.merchantIdentifier}`);
    }

    if (!input.explicitProvider) {
      throw new Error('provider is required unless merchantIdentifier routing is configured');
    }

    return [
      {
        provider: input.explicitProvider,
        priority: 0
      }
    ];
  }
}