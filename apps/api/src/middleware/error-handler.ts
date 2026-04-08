import type { ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const requestId = randomUUID();

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten(),
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  logger.error({ err, requestId }, 'Unhandled error');

  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;
  const message = status === 500 ? 'Internal server error' : (err as Error).message;

  res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message,
    },
    requestId,
    timestamp: new Date().toISOString(),
  });
};
