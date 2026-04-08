import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

router.get('/ready', (_req, res) => {
  // TODO: check database and redis connectivity
  res.json({ status: 'ready' });
});

export const healthRoutes = router;
