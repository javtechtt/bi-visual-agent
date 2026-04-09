import type { ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import multer from 'multer';
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

  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({
      error: {
        code: err.code,
        message: err.code === 'LIMIT_FILE_SIZE'
          ? 'File too large. Maximum size is 50 MB.'
          : err.message,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Multer fileFilter errors come as plain Error with message
  if (err instanceof Error && err.message.includes('Unsupported file type')) {
    res.status(400).json({
      error: {
        code: 'UNSUPPORTED_FILE_TYPE',
        message: err.message,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  logger.error({ err, requestId }, 'Unhandled error');

  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;
  const errMessage = err instanceof Error ? err.message : 'Unknown error';

  // Surface the actual error message in development so upstream service
  // failures (e.g. analytics service) are diagnosable. In production, hide
  // internal details behind a generic message.
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : errMessage;

  res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message,
    },
    requestId,
    timestamp: new Date().toISOString(),
  });
};
