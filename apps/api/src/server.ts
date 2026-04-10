import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { routes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { RealtimeSession, type RealtimeEvent } from './services/realtime-session.js';
import { logger } from './logger.js';

export function createServer() {
  const app = express();

  // ─── Middleware ──────────────────────────────────────────
  app.use(cors({
    origin: config.NODE_ENV === 'development' ? true : config.API_CORS_ORIGIN,
    credentials: true,
  }));
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

  // ─── WebSocket server for Realtime sessions ─────────────
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname === '/api/v1/realtime') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs) => {
    const sessionId = crypto.randomUUID();
    logger.info({ sessionId }, 'Realtime: client connected');

    const session = new RealtimeSession(sessionId, {
      onEvent: (event: RealtimeEvent) => {
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify(event));
        }
      },
    });

    // Connect to OpenAI Realtime
    session.connect().catch((err) => {
      logger.error({ sessionId, err }, 'Realtime: failed to connect to OpenAI');
    });

    clientWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; [key: string]: unknown };
        switch (msg.type) {
          case 'audio':
            session.sendAudio(msg.data as string);
            break;
          case 'audio.commit':
            session.commitAudio();
            break;
          case 'text':
            session.sendText(msg.text as string);
            break;
        }
      } catch (err) {
        logger.error({ sessionId, err }, 'Realtime: invalid client message');
      }
    });

    clientWs.on('close', () => {
      logger.info({ sessionId }, 'Realtime: client disconnected');
      session.close();
    });
  });

  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    wss.close();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}
