import { Router } from 'express';
import multer from 'multer';
import { dataAgent } from '../agents/data-agent.js';
import { getDataset, listDatasets } from '../services/dataset-store.js';
import { logger } from '../logger.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'application/octet-stream'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are supported'));
    }
  },
});

const router = Router();

// ─── List datasets ──────────────────────────────────────────

router.get('/', (_req, res) => {
  const items = listDatasets();
  res.json({
    data: { items, total: items.length, page: 1, limit: 50, hasMore: false },
    requestId: _req.requestId,
    timestamp: new Date().toISOString(),
  });
});

// ─── Get single dataset ─────────────────────────────────────

router.get('/:id', (req, res) => {
  const dataset = getDataset(req.params.id);
  if (!dataset) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Dataset not found' },
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }
  res.json({
    data: dataset,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

// ─── Upload CSV and profile ─────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: { code: 'NO_FILE', message: 'No CSV file provided. Use field name "file".' },
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.info({ filename: file.originalname, size: file.size }, 'CSV upload received');

    const result = await dataAgent.ingestAndProfile(
      {
        filename: file.originalname,
        buffer: file.buffer,
        mimeType: file.mimetype,
      },
      {
        sessionId: (req.body.sessionId as string) ?? crypto.randomUUID(),
        userId: 'demo-user',
        traceId: req.requestId,
        startedAt: new Date(),
      },
    );

    res.status(201).json({
      data: result,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export const datasetRoutes = router;
