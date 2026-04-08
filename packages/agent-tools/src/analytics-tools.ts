import { z } from 'zod';
import { defineTool } from './tool-registry.js';

export const computeKpisTool = defineTool({
  name: 'compute_kpis',
  description: 'Calculate key performance indicators from a dataset with period-over-period comparison',
  category: 'analytics',
  inputSchema: z.object({
    datasetId: z.string().uuid(),
    metrics: z.array(z.string()).min(1),
    groupBy: z.string().optional(),
    dateColumn: z.string().optional(),
    comparisonPeriod: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
  }),
  outputSchema: z.object({
    kpis: z.array(
      z.object({
        metric: z.string(),
        currentValue: z.number(),
        previousValue: z.number().optional(),
        changePercent: z.number().optional(),
        trend: z.enum(['up', 'down', 'stable']).optional(),
      }),
    ),
  }),
});

export const detectTrendsTool = defineTool({
  name: 'detect_trends',
  description: 'Analyze time-series data for trends, seasonality, and momentum',
  category: 'analytics',
  inputSchema: z.object({
    datasetId: z.string().uuid(),
    dateColumn: z.string(),
    valueColumn: z.string(),
    granularity: z.enum(['day', 'week', 'month', 'quarter']).default('month'),
  }),
  outputSchema: z.object({
    trend: z.object({
      direction: z.enum(['increasing', 'decreasing', 'stable', 'volatile']),
      slope: z.number(),
      rSquared: z.number().min(0).max(1),
    }),
    seasonality: z.object({
      detected: z.boolean(),
      period: z.string().optional(),
      strength: z.number().min(0).max(1).optional(),
    }),
    dataPoints: z.array(
      z.object({
        date: z.string(),
        actual: z.number(),
        trendLine: z.number(),
      }),
    ),
  }),
});

export const detectAnomaliesTool = defineTool({
  name: 'detect_anomalies',
  description: 'Identify statistical anomalies and outliers in the dataset',
  category: 'analytics',
  inputSchema: z.object({
    datasetId: z.string().uuid(),
    columns: z.array(z.string()).min(1),
    method: z.enum(['zscore', 'iqr', 'isolation_forest']).default('zscore'),
    threshold: z.number().positive().default(3),
  }),
  outputSchema: z.object({
    anomalies: z.array(
      z.object({
        rowIndex: z.number().int().nonnegative(),
        column: z.string(),
        value: z.unknown(),
        score: z.number(),
        explanation: z.string(),
      }),
    ),
    totalChecked: z.number().int().nonnegative(),
    anomalyRate: z.number().min(0).max(1),
  }),
});

export const analyticsTools = [computeKpisTool, detectTrendsTool, detectAnomaliesTool] as const;
