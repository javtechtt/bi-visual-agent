import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { routes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { logger } from './logger.js';

export function createServer() {
  const app = express();

  // ─── Middleware ──────────────────────────────────────────
  app.use(cors({ origin: config.API_CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(requestId);

  // ─── Routes ─────────────────────────────────────────────
  app.use('/api/v1', routes);

  // ─── Error Handling ─────────────────────────────────────
  app.use(errorHandler);

  return app;
}

export function startServer() {
  const app = createServer();

  const server = app.listen(config.API_PORT, config.API_HOST, () => {
    logger.info(`API server running on http://${config.API_HOST}:${config.API_PORT}`);
  });

  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}
