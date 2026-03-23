import { Router } from 'express';
import { ProviderController } from '../controllers/provider.controller';
import { asyncHandler } from '../middleware/async-handler.middleware';

export const providerRoutes = (controller: ProviderController): Router => {
  const router = Router();

  router.post('/providers/register', asyncHandler(controller.register));

  return router;
};
