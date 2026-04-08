import { NextFunction, Request, Response } from 'express';
import { ProviderOperationError } from '../errors/provider-operation.error';
import { logger } from '../infrastructure/logger';

export const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction): void => {
  logger.error('Unhandled request error', {
    method: req.method,
    path: req.path,
    message: error.message
  });

  if (error instanceof ProviderOperationError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details
    });
    return;
  }

  res.status(400).json({
    error: error.message
  });
};
