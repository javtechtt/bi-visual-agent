/**
 * Realtime Tools — functions the voice agent calls to interact with data.
 *
 * Each tool returns human-readable text (not raw JSON) so the model
 * can speak the results naturally without robotic JSON recitation.
 */

import { listDatasets, getDataset, updateDataset } from './dataset-store.js';
import { analyticsAgent } from '../agents/analytics-agent.js';
import { advisoryAgent, type AdvisoryInput } from '../agents/advisory-agent.js';
import { logger } from '../logger.js';

// ─── Tool Definitions ──────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    name: 'list_datasets',
    description: 'List all uploaded datasets. Call this FIRST when the user asks about their data, to discover what files are available.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function' as const,
    name: 'get_dataset_profile',
    description: 'Read a dataset in detail: every column name, data type, sample values, quality score, and any issues. Use this to understand what the data contains before analyzing it.',
    parameters: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'The dataset UUID' },
      },
      required: ['dataset_id'],
    },
  },
  {
    type: 'function' as const,
    name: 'read_dataset_data',
    description: 'Read the actual data rows from a dataset. Returns the first 30 rows so you can see real values. Use this when the user asks you to read or review their file.',
    parameters: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'The dataset UUID' },
        limit: { type: 'number', description: 'Number of rows to return (default 30, max 50)' },
      },
      required: ['dataset_id'],
    },
  },
  {
    type: 'function' as const,
    name: 'analyze_dataset',
    description: 'Run full statistical analysis: KPI summaries, anomaly detection (z-score + IQR), and trend analysis (linear regression). Returns detailed findings with confidence scores. Use action "all" for comprehensive analysis, or focus on "kpi", "anomaly", or "trend" specifically.',
    parameters: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'The dataset UUID' },
        action: {
          type: 'string',
          enum: ['all', 'kpi', 'anomaly', 'trend'],
          description: 'Analysis type. Default "all" for comprehensive.',
        },
        focus_column: {
          type: 'string',
          description: 'Focus analysis on one specific column. Use the exact column name from the profile.',
        },
      },
      required: ['dataset_id'],
    },
  },
  {
    type: 'function' as const,
    name: 'generate_advisory',
    description: 'Generate strategic advisory: executive summary, top insights ranked by importance, priority focus areas for management, key questions to answer, and recommended follow-up analyses. Call AFTER analyze_dataset.',
    parameters: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'The dataset UUID (must have been analyzed first)' },
      },
      required: ['dataset_id'],
    },
  },
];

// ─── Tool Executor ─────────────────────────────────────────

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  logger.info({ tool: name, args }, 'Realtime tool call');

  try {
    switch (name) {
      case 'list_datasets':
        return toolListDatasets();
      case 'get_dataset_profile':
        return toolGetProfile(args.dataset_id as string);
      case 'read_dataset_data':
        return toolReadData(args.dataset_id as string, args.limit as number | undefined);
      case 'analyze_dataset':
        return await toolAnalyze(args.dataset_id as string, args.action as string | undefined, args.focus_column as string | undefined);
      case 'generate_advisory':
        return await toolAdvisory(args.dataset_id as string);
      default:
        return `Error: Unknown tool "${name}"`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ tool: name, err: msg }, 'Tool execution failed');
    return `Error executing ${name}: ${msg}`;
  }
}

// ─── Implementations ───────────────────────────────────────

function toolListDatasets(): string {
  const datasets = listDatasets();
  if (datasets.length === 0) {
    return 'No datasets uploaded yet. Ask the user to upload a CSV, Excel, or PDF file.';
  }

  const lines = datasets.map((d) => {
    const rows = d.rowCount ? `${d.rowCount} rows` : 'not profiled';
    const cols = d.columnCount ? `${d.columnCount} columns` : '';
    const status = d.capability === 'analysis_ready' ? 'ready for analysis' : d.status === 'error' ? 'profiling failed' : 'ingested';
    return `- "${d.name}" (${d.sourceType.toUpperCase()}) — ${rows}${cols ? ', ' + cols : ''} — ${status} — ID: ${d.id}`;
  });

  return `Found ${datasets.length} dataset(s):\n${lines.join('\n')}`;
}

function toolGetProfile(datasetId: string): string {
  const ds = getDataset(datasetId);
  if (!ds) return 'Dataset not found. Call list_datasets first.';

  const profile = ds.profile as Record<string, unknown> | undefined;
  if (!profile) return `Dataset "${ds.name}" has no profile data.`;

  const columns = profile.columns as { name: string; dtype: string; null_count: number; unique_count: number; sample_values: unknown[]; semantic_type: string | null }[];
  const quality = profile.quality_score as number;
  const issues = profile.issues as { severity: string; column?: string; message: string }[];

  const lines = [
    `Dataset: "${ds.name}" (${ds.sourceType.toUpperCase()})`,
    `Rows: ${ds.rowCount ?? '?'} | Columns: ${ds.columnCount ?? '?'} | Quality: ${Math.round((quality ?? 0) * 100)}%`,
    '',
    'Columns:',
  ];

  for (const col of columns ?? []) {
    const samples = (col.sample_values ?? []).slice(0, 3).map(String).join(', ');
    const semantic = col.semantic_type ? ` [${col.semantic_type}]` : '';
    lines.push(`  ${col.name} (${col.dtype}${semantic}) — ${col.unique_count} unique, ${col.null_count} nulls — samples: ${samples}`);
  }

  if (issues && issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of issues) {
      lines.push(`  [${issue.severity}] ${issue.column ? issue.column + ': ' : ''}${issue.message}`);
    }
  }

  return lines.join('\n');
}

function toolReadData(datasetId: string, limit?: number): string {
  const ds = getDataset(datasetId);
  if (!ds) return 'Dataset not found.';

  const profile = ds.profile as Record<string, unknown> | undefined;
  if (!profile) return 'No profile data available.';

  const columns = profile.columns as { name: string; sample_values: unknown[] }[];
  if (!columns || columns.length === 0) return 'No column data available.';

  const maxRows = Math.min(limit ?? 30, 50);

  // Build a table from sample values (we have up to 5 samples per column from profiling)
  // For a richer view, we construct what we have
  const colNames = columns.map((c) => c.name);
  const rowCount = Math.min(maxRows, Math.max(...columns.map((c) => (c.sample_values ?? []).length)));

  const lines = [
    `Data preview for "${ds.name}" (showing available sample values):`,
    '',
    colNames.join(' | '),
    colNames.map((n) => '-'.repeat(n.length)).join('-+-'),
  ];

  for (let i = 0; i < rowCount; i++) {
    const row = columns.map((c) => {
      const val = (c.sample_values ?? [])[i];
      return val !== null && val !== undefined ? String(val) : '';
    });
    lines.push(row.join(' | '));
  }

  lines.push('');
  lines.push(`Total rows in dataset: ${ds.rowCount ?? '?'}. Showing ${rowCount} sample rows.`);

  return lines.join('\n');
}

async function toolAnalyze(datasetId: string, action?: string, focusColumn?: string): Promise<string> {
  const ds = getDataset(datasetId);
  if (!ds) return 'Dataset not found.';
  if (ds.capability !== 'analysis_ready') {
    return `Dataset "${ds.name}" is not ready for analysis. It may still be processing or profiling failed.`;
  }

  const params: Record<string, unknown> = {};
  if (focusColumn) params.focus_column = focusColumn;

  const result = await analyticsAgent.analyze(
    { datasetId, action: (action ?? 'all') as 'kpi' | 'anomaly' | 'trend' | 'all', parameters: params },
    { sessionId: crypto.randomUUID(), userId: 'realtime', traceId: crypto.randomUUID(), startedAt: new Date() },
  );

  // Persist so advisory can access it
  updateDataset(datasetId, {
    lastAnalysis: result as unknown as Record<string, unknown>,
    lastAnalyzedAt: new Date().toISOString(),
  });

  const lines = [
    `Analysis of "${ds.name}" — ${result.insights.length} findings across ${result.metadata.rowsAnalyzed} rows`,
    `Method: ${result.metadata.methodology}`,
    '',
  ];

  for (const insight of result.insights) {
    const conf = insight.confidence.level;
    lines.push(`[${conf.toUpperCase()}] ${insight.title}`);
    lines.push(`  ${insight.description}`);
    if (insight.followUps && insight.followUps.length > 0) {
      lines.push(`  Follow-ups: ${insight.followUps.join('; ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function toolAdvisory(datasetId: string): Promise<string> {
  const ds = getDataset(datasetId);
  if (!ds) return 'Dataset not found.';
  if (!ds.lastAnalysis) return 'No analysis results. Run analyze_dataset first.';

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

  const lines = [
    'STRATEGIC ADVISORY',
    '',
    advisory.summary,
    '',
  ];

  if (advisory.topInsights.length > 0) {
    lines.push('KEY FINDINGS:');
    for (const ti of advisory.topInsights) {
      lines.push(`  [${ti.importance.toUpperCase()}] ${ti.insight}`);
    }
    lines.push('');
  }

  const ds2 = advisory.decisionSupport;
  if (ds2.priorityFocus.length > 0) {
    lines.push('PRIORITY FOCUS AREAS:');
    for (const pf of ds2.priorityFocus) lines.push(`  - ${pf}`);
    lines.push('');
  }

  if (ds2.managementQuestions.length > 0) {
    lines.push('QUESTIONS MANAGEMENT SHOULD ANSWER:');
    for (const q of ds2.managementQuestions) lines.push(`  - ${q}`);
    lines.push('');
  }

  if (ds2.recommendedFollowUps.length > 0) {
    lines.push('RECOMMENDED NEXT ANALYSES:');
    for (const f of ds2.recommendedFollowUps) lines.push(`  - ${f}`);
    lines.push('');
  }

  lines.push(`CONFIDENCE: ${advisory.confidenceAssessment}`);

  return lines.join('\n');
}
