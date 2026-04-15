import { Router } from 'express';
import { RoutingController } from '../controllers/routing.controller';
import { asyncHandler } from '../middleware/async-handler.middleware';

export const routingRoutes = (controller: RoutingController): Router => {
  const router = Router();

  router.get('/routing-rules', asyncHandler(controller.list));
  router.post('/routing-rules', asyncHandler(controller.upsert));

  return router;
};