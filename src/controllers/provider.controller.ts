import { Request, Response } from 'express';
import { OnboardingService } from '../services/onboarding.service';
import { registerProviderSchema } from '../utils/validators';

export class ProviderController {
  constructor(private readonly onboardingService: OnboardingService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const payload = registerProviderSchema.parse(req.body);
    const result = await this.onboardingService.registerProvider(payload);
    res.status(201).json(result);
  };
}
