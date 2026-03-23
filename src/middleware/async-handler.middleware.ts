import { NextFunction, Request, Response } from 'express';

export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
