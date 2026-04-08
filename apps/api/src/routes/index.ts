import { Router } from 'express';
import { healthRoutes } from './health.js';
import { agentRoutes } from './agents.js';
import { datasetRoutes } from './datasets.js';

const router = Router();

router.use(healthRoutes);
router.use('/agents', agentRoutes);
router.use('/datasets', datasetRoutes);

export const routes = router;
