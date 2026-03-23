import { Request, Response } from 'express';
import { PaymentProviderName } from '../domain/enums';
import { PaymentService } from '../services/payment.service';

export class WebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  handle = (providerName: PaymentProviderName) => async (req: Request, res: Response): Promise<void> => {
    const signature = req.header('x-signature') ?? '';
    const rawPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    await this.paymentService.handleWebhook(providerName, rawPayload, signature, req.body);
    res.status(200).json({ accepted: true });
  };
}
