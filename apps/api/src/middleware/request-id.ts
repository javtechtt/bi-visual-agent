import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export const requestId: RequestHandler = (req, _res, next) => {
  req.requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  next();
};
