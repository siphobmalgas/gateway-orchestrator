import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { asyncHandler } from '../middleware/async-handler.middleware';

export const paymentRoutes = (controller: PaymentController): Router => {
  const router = Router();

  router.get('/transactions', asyncHandler(controller.listTransactions));
  router.get('/transactions/:id/logs', asyncHandler(controller.listTransactionLogs));
  router.get('/payments/:id', asyncHandler(controller.getById));
  router.post('/payments/payment', asyncHandler(controller.payment));
  router.post('/payments/authorize', asyncHandler(controller.authorize));
  router.post('/payments', asyncHandler(controller.create));
  router.post('/payments/:id/capture', asyncHandler(controller.capture));
  router.post('/payments/:id/refund', asyncHandler(controller.refund));

  return router;
};
