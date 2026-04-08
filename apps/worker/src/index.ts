import 'dotenv/config';
import { Worker } from 'bullmq';
import { redis } from './lib/redis.js';
import { config } from './config.js';
import { processDataIngest, processDataProfile } from './processors/data-pipeline.js';
import { processAnalyticsRun } from './processors/analytics-pipeline.js';
import { processReportGenerate } from './processors/report-generator.js';
import { logger } from './logger.js';

const workers: Worker[] = [];

function createWorker(queueName: string, processor: (job: any) => Promise<void>): Worker {
  const worker = new Worker(queueName, processor, {
    connection: redis,
    concurrency: config.WORKER_CONCURRENCY,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, queue: queueName }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, queue: queueName, err }, 'Job failed');
  });

  worker.on('error', (err) => {
    logger.error({ queue: queueName, err }, 'Worker error');
  });

  return worker;
}

// ─── Register Workers ───────────────────────────────────────

workers.push(createWorker('data-ingest', processDataIngest));
workers.push(createWorker('data-profile', processDataProfile));
workers.push(createWorker('analytics-run', processAnalyticsRun));
workers.push(createWorker('report-generate', processReportGenerate));

logger.info({ workerCount: workers.length }, 'All workers started');

// ─── Graceful Shutdown ──────────────────────────────────────

async function shutdown() {
  logger.info('Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  redis.disconnect();
  logger.info('All workers stopped');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
