import { NextFunction, Request, Response } from 'express';
import { logger } from '../infrastructure/logger';

export const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction): void => {
  logger.error('Unhandled request error', {
    method: req.method,
    path: req.path,
    message: error.message
  });

  res.status(400).json({
    error: error.message
  });
};
