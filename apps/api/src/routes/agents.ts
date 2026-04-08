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

router.get('/sessions/:sessionId/messages', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    // TODO: fetch messages from database
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
