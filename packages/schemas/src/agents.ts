import { z } from 'zod';
import { ConfidenceScore, IdSchema, TimestampSchema } from './common.js';

// ─── Agent Identity ─────────────────────────────────────────

export const AgentRole = z.enum(['orchestrator', 'data', 'analytics', 'advisory']);

// ─── Agent Message Protocol ─────────────────────────────────

export const AgentMessageSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  from: AgentRole,
  to: AgentRole,
  type: z.enum(['request', 'response', 'error', 'status']),
  payload: z.record(z.unknown()),
  confidence: ConfidenceScore.optional(),
  parentMessageId: IdSchema.optional(),
  timestamp: TimestampSchema,
});

// ─── Orchestrator ───────────────────────────────────────────

export const OrchestratorRequestSchema = z.object({
  sessionId: IdSchema,
  query: z.string().min(1).max(4000),
  context: z
    .object({
      datasetId: IdSchema.optional(),
      conversationHistory: z.array(AgentMessageSchema).optional(),
      preferences: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export const AgentRoutingDecision = z.object({
  targetAgent: AgentRole,
  reasoning: z.string(),
  subtasks: z.array(
    z.object({
      agent: AgentRole,
      task: z.string(),
      priority: z.number().int().min(1).max(10),
      dependsOn: z.array(z.string()).optional(),
    }),
  ),
});

// ─── Data Agent ─────────────────────────────────────────────

export const DataAgentRequestSchema = z.object({
  sessionId: IdSchema,
  action: z.enum(['ingest', 'clean', 'model', 'query', 'describe']),
  datasetId: IdSchema.optional(),
  parameters: z.record(z.unknown()),
});

export const ColumnProfileSchema = z.object({
  name: z.string(),
  dtype: z.string(),
  nullCount: z.number().int().nonnegative(),
  uniqueCount: z.number().int().nonnegative(),
  sampleValues: z.array(z.unknown()).max(5),
  semanticType: z.string().optional(),
});

export const DataProfileSchema = z.object({
  datasetId: IdSchema,
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().positive(),
  columns: z.array(ColumnProfileSchema),
  qualityScore: z.number().min(0).max(1),
  issues: z.array(
    z.object({
      severity: z.enum(['error', 'warning', 'info']),
      column: z.string().optional(),
      message: z.string(),
    }),
  ),
});

// ─── Analytics Agent ────────────────────────────────────────

export const AnalyticsRequestSchema = z.object({
  sessionId: IdSchema,
  datasetId: IdSchema,
  action: z.enum(['kpi', 'trend', 'correlation', 'anomaly', 'forecast', 'segment']),
  parameters: z.record(z.unknown()),
});

export const ChartType = z.enum([
  'bar',
  'line',
  'area',
  'scatter',
  'pie',
  'heatmap',
  'funnel',
  'table',
  'kpi_card',
]);

export const VisualizationSpec = z.object({
  chartType: ChartType,
  title: z.string(),
  subtitle: z.string().optional(),
  data: z.array(z.record(z.unknown())),
  xAxis: z.string().optional(),
  yAxis: z.string().optional(),
  groupBy: z.string().optional(),
  colorScheme: z.string().optional(),
});

export const AnalyticsResultSchema = z.object({
  sessionId: IdSchema,
  datasetId: IdSchema,
  insights: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      confidence: ConfidenceScore,
      visualization: VisualizationSpec.optional(),
      supportingData: z.record(z.unknown()).optional(),
    }),
  ),
  metadata: z.object({
    processingTimeMs: z.number().nonnegative(),
    rowsAnalyzed: z.number().int().nonnegative(),
    methodology: z.string(),
  }),
});

// ─── Advisory Agent ─────────────────────────────────────────

export const AdvisoryRequestSchema = z.object({
  sessionId: IdSchema,
  context: z.object({
    query: z.string(),
    analyticsResults: z.array(AnalyticsResultSchema).optional(),
    dataProfile: DataProfileSchema.optional(),
    audienceLevel: z.enum(['executive', 'manager', 'analyst']).default('executive'),
  }),
});

export const RecommendationSchema = z.object({
  title: z.string(),
  summary: z.string(),
  impact: z.enum(['high', 'medium', 'low']),
  confidence: ConfidenceScore,
  actionItems: z.array(z.string()),
  risks: z.array(z.string()).optional(),
  timeframe: z.string().optional(),
});

export const AdvisoryResponseSchema = z.object({
  sessionId: IdSchema,
  executiveSummary: z.string(),
  recommendations: z.array(RecommendationSchema),
  visualizations: z.array(VisualizationSpec),
  confidence: ConfidenceScore,
  followUpQuestions: z.array(z.string()),
});
