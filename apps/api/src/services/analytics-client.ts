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
