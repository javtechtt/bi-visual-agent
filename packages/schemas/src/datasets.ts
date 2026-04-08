import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

// ─── Dataset Lifecycle ──────────────────────────────────────

export const DatasetStatus = z.enum([
  'uploading',
  'processing',
  'profiling',
  'ready',
  'error',
  'archived',
]);

export const DatasetSourceType = z.enum(['csv', 'excel', 'json', 'parquet', 'api', 'database']);

export const DatasetSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  sourceType: DatasetSourceType,
  status: DatasetStatus,
  rowCount: z.number().int().nonnegative().optional(),
  columnCount: z.number().int().positive().optional(),
  sizeBytes: z.number().int().nonnegative(),
  createdBy: IdSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const CreateDatasetSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  sourceType: DatasetSourceType,
});

// ─── Dataset Query ──────────────────────────────────────────

export const DatasetQuerySchema = z.object({
  datasetId: IdSchema,
  sql: z.string().min(1).max(10000),
  limit: z.number().int().positive().max(10000).default(1000),
});

export const QueryResultSchema = z.object({
  columns: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    }),
  ),
  rows: z.array(z.array(z.unknown())),
  rowCount: z.number().int().nonnegative(),
  executionTimeMs: z.number().nonnegative(),
  truncated: z.boolean(),
});
