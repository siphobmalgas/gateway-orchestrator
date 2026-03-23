import { Request, Response } from 'express';
import { OnboardingService } from '../services/onboarding.service';
import { createMerchantSchema } from '../utils/validators';

export class MerchantController {
  constructor(private readonly onboardingService: OnboardingService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const payload = createMerchantSchema.parse(req.body);
    const merchant = await this.onboardingService.createMerchant(payload);
    res.status(201).json(merchant);
  };
}
