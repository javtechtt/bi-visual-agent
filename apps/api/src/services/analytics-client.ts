import { config } from '../config.js';
import { logger } from '../logger.js';

interface ProfileResult {
  dataset_id: string;
  row_count: number;
  column_count: number;
  columns: {
    name: string;
    dtype: string;
    null_count: number;
    unique_count: number;
    sample_values: unknown[];
    semantic_type: string | null;
  }[];
  quality_score: number;
  issues: { severity: string; column?: string; message: string }[];
}

// ─── Analyze ────────────────────────────────────────────────

interface AnalyticsInsight {
  title: string;
  description: string;
  confidence: { level: string; score: number; reasoning: string };
  visualization: {
    chartType: string;
    title: string;
    data: Record<string, unknown>[];
    xAxis?: string;
    yAxis?: string;
  } | null;
  supporting_data: Record<string, unknown> | null;
}

interface AnalyticsResult {
  session_id: string;
  dataset_id: string;
  insights: AnalyticsInsight[];
  metadata: {
    processing_time_ms: number;
    rows_analyzed: number;
    methodology: string;
  };
}

export async function analyzeDataset(
  datasetId: string,
  sessionId: string,
  action: string,
  parameters: Record<string, unknown> = {},
): Promise<AnalyticsResult> {
  const url = `${config.ANALYTICS_SERVICE_URL}/api/v1/analyze`;
  logger.info({ url, datasetId, action }, 'Calling analytics service for analysis');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      dataset_id: datasetId,
      action,
      parameters,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Analytics service analyze failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<AnalyticsResult>;
}

export type { AnalyticsResult, AnalyticsInsight };

// ─── Profile ────────────────────────────────────────────────

export async function profileCsv(
  datasetId: string,
  fileBuffer: Buffer,
  filename: string,
): Promise<ProfileResult> {
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer]), filename);
  formData.append('dataset_id', datasetId);

  const url = `${config.ANALYTICS_SERVICE_URL}/api/v1/profile`;
  logger.info({ url, datasetId, filename }, 'Calling analytics service for profiling');

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Analytics service profile failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<ProfileResult>;
}
