/**
 * Realtime Tools — callable functions exposed to the OpenAI Realtime model.
 *
 * Each tool wraps an existing internal service. The Realtime model can invoke
 * these during a conversation to fetch real data, run analyses, etc.
 */

import { listDatasets, getDataset } from './dataset-store.js';
import { analyticsAgent } from '../agents/analytics-agent.js';
import { advisoryAgent, type AdvisoryInput } from '../agents/advisory-agent.js';
import { logger } from '../logger.js';

// ─── Tool Schemas (JSON Schema for OpenAI function calling) ─

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    name: 'list_datasets',
    description: 'List all uploaded datasets with their names, types, row counts, and analysis status.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function' as const,
    name: 'get_dataset_profile',
    description: 'Get the detailed profile of a specific dataset including column names, types, quality score, and sample values.',
    parameters: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'The UUID of the dataset to profile' },
      },
      required: ['dataset_id'],
    },
  },
  {
    type: 'function' as const,
    name: 'analyze_dataset',
    description: 'Run statistical analysis on a dataset. Returns KPIs, anomaly detection, and trend analysis with visualizations.',
    parameters: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'The UUID of the dataset to analyze' },
        action: {
          type: 'string',
          enum: ['all', 'kpi', 'anomaly', 'trend'],
          description: 'Type of analysis to run. Use "all" for comprehensive analysis.',
        },
        focus_column: {
          type: 'string',
          description: 'Optional: focus analysis on a specific column name',
        },
      },
      required: ['dataset_id'],
    },
  },
  {
    type: 'function' as const,
    name: 'generate_advisory',
    description: 'Generate a strategic advisory interpretation of analysis results. Provides executive summary, key insights, hypotheses, and decision-support guidance.',
    parameters: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'The UUID of the analyzed dataset' },
      },
      required: ['dataset_id'],
    },
  },
];

// ─── Tool Executor ─────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  logger.info({ tool: name, args }, 'Realtime tool call');

  try {
    switch (name) {
      case 'list_datasets':
        return executeListDatasets();
      case 'get_dataset_profile':
        return executeGetProfile(args.dataset_id as string);
      case 'analyze_dataset':
        return executeAnalyze(args.dataset_id as string, args.action as string | undefined, args.focus_column as string | undefined);
      case 'generate_advisory':
        return executeAdvisory(args.dataset_id as string);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ tool: name, err: msg }, 'Realtime tool execution failed');
    return JSON.stringify({ error: msg });
  }
}

// ─── Tool Implementations ──────────────────────────────────

function executeListDatasets(): string {
  const datasets = listDatasets();
  return JSON.stringify(datasets.map((d) => ({
    id: d.id,
    name: d.name,
    sourceType: d.sourceType,
    status: d.status,
    capability: d.capability,
    rowCount: d.rowCount,
    columnCount: d.columnCount,
  })));
}

function executeGetProfile(datasetId: string): string {
  const ds = getDataset(datasetId);
  if (!ds) return JSON.stringify({ error: 'Dataset not found' });

  return JSON.stringify({
    id: ds.id,
    name: ds.name,
    sourceType: ds.sourceType,
    rowCount: ds.rowCount,
    columnCount: ds.columnCount,
    profile: ds.profile,
  });
}

async function executeAnalyze(
  datasetId: string,
  action?: string,
  focusColumn?: string,
): Promise<string> {
  const ds = getDataset(datasetId);
  if (!ds) return JSON.stringify({ error: 'Dataset not found' });
  if (ds.capability !== 'analysis_ready') {
    return JSON.stringify({ error: `Dataset "${ds.name}" is not ready for analysis` });
  }

  const params: Record<string, unknown> = {};
  if (focusColumn) params.focus_column = focusColumn;

  const result = await analyticsAgent.analyze(
    { datasetId, action: (action ?? 'all') as 'kpi' | 'anomaly' | 'trend' | 'all', parameters: params },
    { sessionId: crypto.randomUUID(), userId: 'realtime', traceId: crypto.randomUUID(), startedAt: new Date() },
  );

  // Return a summary suitable for the model to speak
  return JSON.stringify({
    datasetName: ds.name,
    insightCount: result.insights.length,
    methodology: result.metadata.methodology,
    insights: result.insights.map((i) => ({
      title: i.title,
      description: i.description,
      confidence: i.confidence.level,
    })),
    rowsAnalyzed: result.metadata.rowsAnalyzed,
  });
}

async function executeAdvisory(datasetId: string): Promise<string> {
  const ds = getDataset(datasetId);
  if (!ds) return JSON.stringify({ error: 'Dataset not found' });
  if (!ds.lastAnalysis) {
    return JSON.stringify({ error: 'No analysis results available. Run analyze_dataset first.' });
  }

  const analysis = ds.lastAnalysis as Record<string, unknown>;
  const insights = (analysis.insights as { title: string; description: string; confidence: { level: string; score: number; reasoning: string }; supportingData?: Record<string, unknown> | null }[]) ?? [];

  const advisoryInput: AdvisoryInput = {
    datasetName: ds.name,
    rowCount: ds.rowCount ?? 0,
    columnCount: ds.columnCount ?? 0,
    insights,
    metadata: analysis.metadata as { processingTimeMs: number; rowsAnalyzed: number; methodology: string },
    overallConfidence: (analysis.confidence as { level: string; score: number; reasoning: string }) ?? { level: 'low', score: 0, reasoning: 'unknown' },
  };

  const advisory = await advisoryAgent.interpret(
    advisoryInput,
    { sessionId: crypto.randomUUID(), userId: 'realtime', traceId: crypto.randomUUID(), startedAt: new Date() },
  );

  return JSON.stringify({
    summary: advisory.summary,
    topInsights: advisory.topInsights,
    decisionSupport: advisory.decisionSupport,
    confidenceAssessment: advisory.confidenceAssessment,
  });
}
