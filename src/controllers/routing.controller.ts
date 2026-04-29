import { Request, Response } from 'express';
import { OnboardingService } from '../services/onboarding.service';
import { createRoutingRuleSchema } from '../utils/validators';

export class RoutingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  upsert = async (req: Request, res: Response): Promise<void> => {
    const payload = createRoutingRuleSchema.parse(req.body);
    const rule = await this.onboardingService.upsertRoutingRule(payload);
    res.status(201).json(rule);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const merchantIdentifier = typeof req.query.merchantIdentifier === 'string' ? req.query.merchantIdentifier : undefined;
    const rules = await this.onboardingService.listRoutingRules(merchantIdentifier);
    res.status(200).json(rules);
  };
}