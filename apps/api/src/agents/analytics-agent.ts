import type { AgentContext, AgentRoleType } from '@bi/types';
import { logger } from '../logger.js';
import {
  analyzeDataset,
  type AnalyticsResult,
  type AnalyticsInsight,
} from '../services/analytics-client.js';
import { getDataset } from '../services/dataset-store.js';
import { interpretQuery, type FollowUpContext, type InterpretedIntent } from '../services/query-interpreter.js';

export interface AnalyticsAgentRequest {
  datasetId: string;
  action: 'kpi' | 'anomaly' | 'trend' | 'all' | 'follow_up';
  parameters?: Record<string, unknown>;
  /** For follow_up action: the natural-language query */
  query?: string;
  /** For follow_up action: context from the originating insight */
  context?: FollowUpContext;
}

export interface VisualSpec {
  type: string;
  x: string;
  y: string;
  title: string;
  data: Record<string, unknown>[];
}

export interface AnalyticsAgentResult {
  agent: AgentRoleType;
  datasetId: string;
  insights: {
    title: string;
    description: string;
    confidence: { level: string; score: number; reasoning: string };
    visualization: Record<string, unknown> | null;
    visual: VisualSpec | null;
    followUps: string[];
    supportingData: Record<string, unknown> | null;
  }[];
  interpretation?: {
    intent: string;
    focusColumn: string | null;
    confident: boolean;
    originalQuery: string;
  };
  metadata: {
    processingTimeMs: number;
    rowsAnalyzed: number;
    methodology: string;
  };
  confidence: { level: string; score: number; reasoning: string };
}

class AnalyticsAgent {
  readonly role: AgentRoleType = 'analytics';

  async execute(task: string, context: AgentContext): Promise<Record<string, unknown>> {
    logger.info({ sessionId: context.sessionId, task }, 'Analytics agent: NL query (LLM pending)');
    return {
      agent: this.role,
      sessionId: context.sessionId,
      task,
      status: 'completed',
      result: { message: 'Analytics agent NL query — LLM integration pending' },
    };
  }

  async analyze(
    request: AnalyticsAgentRequest,
    context: AgentContext,
  ): Promise<AnalyticsAgentResult> {
    const { datasetId, parameters = {} } = request;
    let { action } = request;

    // Look up dataset to get file path and column names for the Python service
    const dataset = getDataset(datasetId);
    if (dataset?.storagePath) {
      parameters.file_path = dataset.storagePath;
    }

    // Interpret follow-up queries into structured intents
    let interpretation: InterpretedIntent | null = null;
    if (action === 'follow_up' && request.query) {
      const datasetColumns = dataset?.profile
        ? ((dataset.profile as Record<string, unknown>).columns as { name: string }[] | undefined)?.map((c) => c.name) ?? []
        : [];

      interpretation = interpretQuery(request.query, {
        ...request.context,
        datasetColumns,
      });

      action = interpretation.action;
      Object.assign(parameters, interpretation.parameters);

      logger.info(
        { datasetId, intent: interpretation.intent, resolvedAction: action, focusColumn: interpretation.focusColumn, confident: interpretation.confident },
        'Analytics agent: follow-up interpreted',
      );
    }

    logger.info({ sessionId: context.sessionId, datasetId, action }, 'Analytics agent: running analysis');

    const result: AnalyticsResult = await analyzeDataset(
      datasetId,
      context.sessionId,
      action === 'all' ? 'all' : action,
      parameters,
    );

    // Compute aggregate confidence across all insights
    const scores = result.insights
      .map((i: AnalyticsInsight) => i.confidence.score)
      .filter((s: number) => s > 0);
    const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;

    const overallConfidence = {
      level: avgScore >= 0.8 ? 'high' : avgScore >= 0.5 ? 'medium' : 'low',
      score: Math.round(avgScore * 1000) / 1000,
      reasoning: `Aggregate of ${result.insights.length} insight(s) across ${result.metadata.rows_analyzed} rows`,
    };

    logger.info(
      { datasetId, insightCount: result.insights.length, timeMs: result.metadata.processing_time_ms },
      'Analytics agent: analysis complete',
    );

    return {
      agent: this.role,
      datasetId,
      ...(interpretation ? {
        interpretation: {
          intent: interpretation.intent,
          focusColumn: interpretation.focusColumn,
          confident: interpretation.confident,
          originalQuery: interpretation.originalQuery,
        },
      } : {}),
      insights: result.insights.map((i: AnalyticsInsight) => ({
        title: i.title,
        description: i.description,
        confidence: i.confidence,
        visualization: i.visualization,
        visual: i.visual ?? null,
        followUps: i.follow_ups ?? [],
        supportingData: i.supporting_data,
      })),
      metadata: {
        processingTimeMs: result.metadata.processing_time_ms,
        rowsAnalyzed: result.metadata.rows_analyzed,
        methodology: result.metadata.methodology,
      },
      confidence: overallConfidence,
    };
  }
}

export const analyticsAgent = new AnalyticsAgent();
