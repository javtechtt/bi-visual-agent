import type { Job } from 'bullmq';
import { logger } from '../logger.js';

interface DataIngestPayload {
  datasetId: string;
  filePath: string;
  sourceType: string;
  userId: string;
}

interface DataProfilePayload {
  datasetId: string;
  sampleSize?: number;
}

export async function processDataIngest(job: Job<DataIngestPayload>): Promise<void> {
  const { datasetId, filePath, sourceType } = job.data;
  logger.info({ datasetId, filePath, sourceType }, 'Starting data ingestion');

  await job.updateProgress(10);

  // TODO: parse file based on sourceType
  // TODO: store parsed data
  // TODO: update dataset status in database
  await job.updateProgress(50);

  // TODO: trigger profiling job
  await job.updateProgress(100);

  logger.info({ datasetId }, 'Data ingestion complete');
}

export async function processDataProfile(job: Job<DataProfilePayload>): Promise<void> {
  const { datasetId, sampleSize } = job.data;
  logger.info({ datasetId, sampleSize }, 'Starting data profiling');

  await job.updateProgress(10);

  // TODO: call analytics service for profiling
  // TODO: store profile in database
  await job.updateProgress(100);

  logger.info({ datasetId }, 'Data profiling complete');
}
