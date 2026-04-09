import { Router } from 'express';
import multer from 'multer';
import { dataAgent } from '../agents/data-agent.js';
import { analyticsAgent } from '../agents/analytics-agent.js';
import { getDataset, updateDataset, listDatasets } from '../services/dataset-store.js';
import { logger } from '../logger.js';

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.pdf'];
const ALLOWED_MIMES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'application/octet-stream',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (ALLOWED_MIMES.includes(file.mimetype) || ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }
  },
});

const router = Router();

function getFileType(filename: string, mimetype: string): 'csv' | 'excel' | 'pdf' {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (ext === '.pdf' || mimetype === 'application/pdf') return 'pdf';
  if (ext === '.xlsx' || ext === '.xls' || mimetype.includes('spreadsheet')) return 'excel';
  return 'csv';
}

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

// ─── Upload and profile ─────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: { code: 'NO_FILE', message: 'No file provided. Use field name "file".' },
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const fileType = getFileType(file.originalname, file.mimetype);
    logger.info({ filename: file.originalname, size: file.size, fileType }, 'File upload received');

    const result = await dataAgent.ingestAndProfile(
      {
        filename: file.originalname,
        buffer: file.buffer,
        mimeType: file.mimetype,
        fileType,
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

// ─── Analyze dataset ────────────────────────────────────────

router.post('/:id/analyze', async (req, res, next) => {
  try {
    const dataset = getDataset(req.params.id);
    if (!dataset) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Dataset not found' },
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (dataset.capability !== 'analysis_ready') {
      const typeLabel = dataset.sourceType === 'pdf' ? 'PDF document' : `${dataset.sourceType.toUpperCase()} file`;
      res.status(422).json({
        error: {
          code: 'ANALYSIS_NOT_AVAILABLE',
          message: `${typeLabel} "${dataset.name}" has been accepted and stored, but analytics requires a profiled tabular dataset. Upload a CSV for immediate analysis.`,
          details: { capability: dataset.capability, sourceType: dataset.sourceType },
        },
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const action = (req.body.action as string) ?? 'all';
    const parameters = (req.body.parameters as Record<string, unknown>) ?? {};

    logger.info({ datasetId: dataset.id, action }, 'Analyze request received');

    const result = await analyticsAgent.analyze(
      { datasetId: dataset.id, action: action as 'kpi' | 'anomaly' | 'trend' | 'all', parameters },
      {
        sessionId: (req.body.sessionId as string) ?? crypto.randomUUID(),
        userId: 'demo-user',
        traceId: req.requestId,
        startedAt: new Date(),
      },
    );

    // Persist analysis result on the dataset record
    updateDataset(dataset.id, {
      lastAnalysis: result as unknown as Record<string, unknown>,
      lastAnalyzedAt: new Date().toISOString(),
    });

    res.json({
      data: result,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get stored analysis results ────────────────────────────

router.get('/:id/analysis', (req, res) => {
  const dataset = getDataset(req.params.id);
  if (!dataset) {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Dataset not found' },
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (!dataset.lastAnalysis) {
    res.status(404).json({
      error: { code: 'NO_ANALYSIS', message: 'No analysis has been run on this dataset yet' },
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.json({
    data: dataset.lastAnalysis,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

export const datasetRoutes = router;
