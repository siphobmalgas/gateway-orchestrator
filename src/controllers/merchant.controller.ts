import { Request, Response } from 'express';
import { OnboardingService } from '../services/onboarding.service';
import { createMerchantSchema, updateMerchantWebhookSchema } from '../utils/validators';

export class MerchantController {
  constructor(private readonly onboardingService: OnboardingService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const payload = createMerchantSchema.parse(req.body);
    const merchant = await this.onboardingService.createMerchant(payload);
    res.status(201).json(merchant);
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const merchantIdentifier = req.params.merchantIdentifier as string;
    const merchant = await this.onboardingService.getMerchant(merchantIdentifier);
    if (!merchant) {
      res.status(404).json({ error: 'Merchant not found' });
      return;
    }
    res.json(merchant);
  };

  updateWebhookUrl = async (req: Request, res: Response): Promise<void> => {
    const merchantIdentifier = req.params.merchantIdentifier as string;
    const payload = updateMerchantWebhookSchema.parse(req.body);
    const merchant = await this.onboardingService.updateMerchantWebhookUrl(
      merchantIdentifier,
      payload.webhookUrl
    );
    res.json(merchant);
  };
}
