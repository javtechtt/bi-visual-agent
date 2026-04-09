import type { AgentContext, AgentRoleType } from '@bi/types';
import { logger } from '../logger.js';
import {
  analyzeDataset,
  type AnalyticsResult,
  type AnalyticsInsight,
} from '../services/analytics-client.js';
import { getDataset } from '../services/dataset-store.js';

export interface AnalyticsAgentRequest {
  datasetId: string;
  action: 'kpi' | 'anomaly' | 'trend' | 'all';
  parameters?: Record<string, unknown>;
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
    const { datasetId, action, parameters = {} } = request;
    logger.info({ sessionId: context.sessionId, datasetId, action }, 'Analytics agent: running analysis');

    // Look up dataset to get file path for the Python service
    const dataset = getDataset(datasetId);
    if (dataset?.storagePath) {
      parameters.file_path = dataset.storagePath;
    }

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
