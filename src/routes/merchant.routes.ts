import { Router } from 'express';
import { MerchantController } from '../controllers/merchant.controller';
import { asyncHandler } from '../middleware/async-handler.middleware';

export const merchantRoutes = (controller: MerchantController): Router => {
  const router = Router();

  router.post('/merchants', asyncHandler(controller.create));

  return router;
};
