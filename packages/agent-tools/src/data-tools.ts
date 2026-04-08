import { z } from 'zod';
import { defineTool } from './tool-registry.js';

export const ingestDatasetTool = defineTool({
  name: 'ingest_dataset',
  description: 'Parse and ingest a dataset file into the platform',
  category: 'data',
  inputSchema: z.object({
    filePath: z.string(),
    sourceType: z.enum(['csv', 'excel', 'json', 'parquet']),
    options: z
      .object({
        delimiter: z.string().optional(),
        headerRow: z.number().int().nonnegative().optional(),
        encoding: z.string().optional(),
      })
      .optional(),
  }),
  outputSchema: z.object({
    datasetId: z.string().uuid(),
    rowCount: z.number().int().nonnegative(),
    columnCount: z.number().int().positive(),
    status: z.literal('processing'),
  }),
});

export const profileDatasetTool = defineTool({
  name: 'profile_dataset',
  description: 'Generate a statistical profile of a dataset including column types and quality metrics',
  category: 'data',
  inputSchema: z.object({
    datasetId: z.string().uuid(),
    sampleSize: z.number().int().positive().max(100000).optional(),
  }),
  outputSchema: z.object({
    datasetId: z.string().uuid(),
    rowCount: z.number().int().nonnegative(),
    columnCount: z.number().int().positive(),
    columns: z.array(
      z.object({
        name: z.string(),
        dtype: z.string(),
        nullCount: z.number().int().nonnegative(),
        uniqueCount: z.number().int().nonnegative(),
        sampleValues: z.array(z.unknown()),
      }),
    ),
    qualityScore: z.number().min(0).max(1),
  }),
});

export const queryDatasetTool = defineTool({
  name: 'query_dataset',
  description: 'Execute a SQL query against a dataset using DuckDB',
  category: 'data',
  inputSchema: z.object({
    datasetId: z.string().uuid(),
    sql: z.string().min(1).max(10000),
    limit: z.number().int().positive().max(10000).default(1000),
  }),
  outputSchema: z.object({
    columns: z.array(z.object({ name: z.string(), type: z.string() })),
    rows: z.array(z.array(z.unknown())),
    rowCount: z.number().int().nonnegative(),
    executionTimeMs: z.number().nonnegative(),
  }),
});

export const dataTools = [ingestDatasetTool, profileDatasetTool, queryDatasetTool] as const;
