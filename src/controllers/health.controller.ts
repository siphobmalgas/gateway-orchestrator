import { Request, Response } from 'express';
import { metricsRegistry } from '../infrastructure/metrics';

export class HealthController {
  health = (_req: Request, res: Response): void => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  };

  metrics = async (_req: Request, res: Response): Promise<void> => {
    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.status(200).send(await metricsRegistry.metrics());
  };
}
