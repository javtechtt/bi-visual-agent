import { Router } from 'express';
import { orchestrator } from '../agents/orchestrator.js';
import { logger } from '../logger.js';

const router = Router();

// ─── Original POST endpoint (kept for backwards compatibility) ──

router.post('/', async (req, res, next) => {
  try {
    const query = req.body.query;
    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({
        error: { code: 'INVALID_QUERY', message: 'query field is required' },
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.info({ query: query.slice(0, 100) }, 'Query endpoint received');

    const result = await orchestrator.query(query.trim());

    res.json({
      data: result,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Query failed');
    next(err);
  }
});

// ─── SSE streaming endpoint for progressive UI updates ──────

router.get('/stream', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({
      error: { code: 'INVALID_QUERY', message: 'q query parameter is required' },
    });
    return;
  }

  logger.info({ query: query.slice(0, 100) }, 'Stream query received');

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const event of orchestrator.queryStream(query.trim())) {
      send(event);
    }
  } catch (err) {
    logger.error({ err }, 'Stream query failed');
    send({ stage: 'error', message: err instanceof Error ? err.message : 'Query failed' });
  }

  res.end();
});

export const queryRoutes = router;
