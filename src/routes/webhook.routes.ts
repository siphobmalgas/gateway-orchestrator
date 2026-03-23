import express, { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
import { PaymentProviderName } from '../domain/enums';
import { asyncHandler } from '../middleware/async-handler.middleware';

export const webhookRoutes = (controller: WebhookController): Router => {
  const router = Router();

  router.post('/webhooks/payu', express.text({ type: '*/*' }), asyncHandler(controller.handle(PaymentProviderName.PAYU)));
  router.post('/webhooks/payfast', express.text({ type: '*/*' }), asyncHandler(controller.handle(PaymentProviderName.PAYFAST)));
  router.post('/webhooks/stitch', express.text({ type: '*/*' }), asyncHandler(controller.handle(PaymentProviderName.STITCH)));
  router.post('/webhooks/peach', express.text({ type: '*/*' }), asyncHandler(controller.handle(PaymentProviderName.PEACH)));

  return router;
};
