import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  req.requestId = randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};
