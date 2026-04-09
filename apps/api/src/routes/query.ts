import { Router } from 'express';
import { orchestrator } from '../agents/orchestrator.js';
import { logger } from '../logger.js';

const router = Router();

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

export const queryRoutes = router;
