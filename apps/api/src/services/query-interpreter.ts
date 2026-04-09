/**
 * Query Interpreter — converts natural-language follow-up queries into
 * structured analysis intents using rule-based keyword matching.
 *
 * No LLM required. Designed to be extended later with model-based parsing.
 */

import { logger } from '../logger.js';

// ─── Types ─────────────────────────────────────────────────

export type IntentType =
  | 'breakdown'
  | 'anomaly_focus'
  | 'explain_trend'
  | 'compare_metrics'
  | 'distribution_analysis'
  | 'general_analysis';

export interface InterpretedIntent {
  intent: IntentType;
  /** The analysis action to route to (kpi, anomaly, trend, all) */
  action: 'kpi' | 'anomaly' | 'trend' | 'all';
  /** Column to focus on (inferred from context or query) */
  focusColumn: string | null;
  /** Additional parameters for the analysis */
  parameters: Record<string, unknown>;
  /** Original query for logging */
  originalQuery: string;
  /** Whether this was a confident match or a fallback */
  confident: boolean;
}

export interface FollowUpContext {
  metric?: string;
  insightType?: string;
  datasetColumns?: string[];
}

// ─── Keyword Rules ─────────────────────────────────────────

interface Rule {
  intent: IntentType;
  action: 'kpi' | 'anomaly' | 'trend' | 'all';
  keywords: string[];
}

const RULES: Rule[] = [
  // Anomaly-focused queries
  {
    intent: 'anomaly_focus',
    action: 'anomaly',
    keywords: ['anomal', 'outlier', 'unusual', 'abnormal', 'extreme', 'without the outlier'],
  },
  // Trend explanation
  {
    intent: 'explain_trend',
    action: 'trend',
    keywords: ['trend', 'increasing', 'decreasing', 'decline', 'growth', 'over time', 'pattern'],
  },
  // Breakdown / segmentation
  {
    intent: 'breakdown',
    action: 'kpi',
    keywords: ['break down', 'breakdown', 'by category', 'by segment', 'segment', 'group by', 'split by'],
  },
  // Comparison
  {
    intent: 'compare_metrics',
    action: 'all',
    keywords: ['compare', 'versus', 'vs', 'correlation', 'relationship', 'against'],
  },
  // Distribution
  {
    intent: 'distribution_analysis',
    action: 'kpi',
    keywords: ['distribution', 'spread', 'histogram', 'range', 'variance', 'dispersion'],
  },
];

// ─── Interpreter ───────────────────────────────────────────

export function interpretQuery(
  query: string,
  context: FollowUpContext = {},
): InterpretedIntent {
  const q = query.toLowerCase().trim();

  // Try each rule in priority order
  for (const rule of RULES) {
    const matchedKeyword = rule.keywords.find((kw) => q.includes(kw));
    if (matchedKeyword) {
      const focusColumn = inferColumn(q, context);

      const result: InterpretedIntent = {
        intent: rule.intent,
        action: rule.action,
        focusColumn,
        parameters: buildParameters(rule.intent, focusColumn, context),
        originalQuery: query,
        confident: true,
      };

      logger.info(
        { intent: result.intent, action: result.action, focusColumn, matchedKeyword, query: query.slice(0, 80) },
        'Query interpreted',
      );

      return result;
    }
  }

  // Fallback: run full analysis, infer column from context
  const focusColumn = inferColumn(q, context);

  const fallback: InterpretedIntent = {
    intent: 'general_analysis',
    action: 'all',
    focusColumn,
    parameters: focusColumn ? { focus_column: focusColumn } : {},
    originalQuery: query,
    confident: false,
  };

  logger.info(
    { intent: 'general_analysis', focusColumn, query: query.slice(0, 80) },
    'Query interpretation fallback — no keyword match',
  );

  return fallback;
}

// ─── Column Inference ──────────────────────────────────────

function inferColumn(query: string, context: FollowUpContext): string | null {
  const q = query.toLowerCase();

  // 1. Check if the query explicitly mentions a known column
  if (context.datasetColumns) {
    for (const col of context.datasetColumns) {
      if (q.includes(col.toLowerCase())) {
        return col;
      }
      // Also match humanized version: "Revenue" matches "revenue", "Units Sold" matches "units_sold"
      const humanized = col.replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase();
      if (humanized.length > 2 && q.includes(humanized)) {
        return col;
      }
    }
  }

  // 2. Fall back to metric from the originating insight context
  if (context.metric) {
    return context.metric;
  }

  return null;
}

// ─── Parameter Builder ─────────────────────────────────────

function buildParameters(
  intent: IntentType,
  focusColumn: string | null,
  _context: FollowUpContext,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (focusColumn) {
    params.focus_column = focusColumn;
  }

  switch (intent) {
    case 'anomaly_focus':
      params.threshold = 2.0; // slightly more sensitive for focused view
      break;
    case 'explain_trend':
      // Trend-focused — Python will scope to this column
      break;
    case 'breakdown':
      // KPI-focused — Python will scope to this column
      break;
    case 'compare_metrics':
      // Full analysis to see all metrics side by side
      break;
    case 'distribution_analysis':
      // KPI-focused — histogram will be generated
      break;
  }

  return params;
}
