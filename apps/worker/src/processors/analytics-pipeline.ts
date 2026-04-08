import type { Job } from 'bullmq';
import { config } from '../config.js';
import { logger } from '../logger.js';

interface AnalyticsRunPayload {
  sessionId: string;
  datasetId: string;
  action: string;
  parameters: Record<string, unknown>;
}

export async function processAnalyticsRun(job: Job<AnalyticsRunPayload>): Promise<void> {
  const { sessionId, datasetId, action } = job.data;
  logger.info({ sessionId, datasetId, action }, 'Starting analytics run');

  await job.updateProgress(10);

  // Delegate heavy computation to Python analytics service
  const response = await fetch(`${config.ANALYTICS_SERVICE_URL}/api/v1/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job.data),
  });

  if (!response.ok) {
    throw new Error(`Analytics service error: ${response.status}`);
  }

  await job.updateProgress(80);

  const result = await response.json();
  logger.info({ sessionId, datasetId, action, resultKeys: Object.keys(result as object) }, 'Analytics run complete');

  // TODO: store results, notify via WebSocket
  await job.updateProgress(100);
}
