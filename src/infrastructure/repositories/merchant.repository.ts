import { Merchant } from '../../domain/merchant.entity';

export interface MerchantRepository {
  create(merchant: Merchant): Promise<void>;
  findByMerchantIdentifier(merchantIdentifier: string): Promise<Merchant | null>;
}
