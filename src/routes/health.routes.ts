import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';
import { asyncHandler } from '../middleware/async-handler.middleware';

export const healthRoutes = (controller: HealthController): Router => {
  const router = Router();

  router.get('/health', controller.health);
  router.get('/metrics', asyncHandler(controller.metrics));

  return router;
};
