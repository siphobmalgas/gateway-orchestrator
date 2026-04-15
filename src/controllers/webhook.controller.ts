import { Request, Response } from 'express';
import { PaymentProviderName } from '../domain/enums';
import { PaymentService } from '../services/payment.service';

const parseWebhookPayload = (req: Request, rawPayload: string): unknown => {
  const contentType = req.header('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return rawPayload;
  }

  try {
    return JSON.parse(rawPayload);
  } catch {
    return rawPayload;
  }
};

export class WebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  handle = (providerName: PaymentProviderName) => async (req: Request, res: Response): Promise<void> => {
    const signature = req.header('x-signature') ?? '';
    const rawPayload = typeof req.body === 'string' ? req.body : '';
    const parsedPayload = parseWebhookPayload(req, rawPayload);

    await this.paymentService.handleWebhook(providerName, rawPayload, signature, parsedPayload);
    res.status(200).json({ accepted: true });
  };
}
