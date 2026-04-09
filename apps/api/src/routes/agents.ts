import { Router } from 'express';
import { OrchestratorRequestSchema } from '@bi/schemas';
import { orchestrator } from '../agents/orchestrator.js';
import { logger } from '../logger.js';

const router = Router();

router.post('/query', async (req, res, next) => {
  try {
    const parsed = OrchestratorRequestSchema.parse(req.body);
    const result = await orchestrator.handle(parsed);
    res.json({
      data: result,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Agent query failed');
    next(err);
  }
});

// Simple chat endpoint — auto-creates sessionId if not provided
router.post('/chat', async (req, res, next) => {
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

    const sessionId = (req.body.sessionId as string) ?? crypto.randomUUID();

    logger.info({ sessionId, query: query.slice(0, 100) }, 'Chat message received');

    const result = await orchestrator.handle({
      sessionId,
      query: query.trim(),
    });

    res.json({
      data: result,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Chat query failed');
    next(err);
  }
});

router.get('/sessions/:sessionId/messages', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    res.json({
      data: { sessionId, messages: [] },
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export const agentRoutes = router;
