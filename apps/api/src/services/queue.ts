import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.js';
import type { JobType } from '@bi/types';

const connection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const queues = new Map<JobType, Queue>();

function getQueue(jobType: JobType): Queue {
  let queue = queues.get(jobType);
  if (!queue) {
    const queueName = jobType.replace(':', '-');
    queue = new Queue(queueName, { connection });
    queues.set(jobType, queue);
  }
  return queue;
}

export async function enqueueJob(
  type: JobType,
  data: Record<string, unknown>,
  options?: { priority?: number; delay?: number },
): Promise<string> {
  const queue = getQueue(type);
  const job = await queue.add(type, data, {
    priority: options?.priority,
    delay: options?.delay,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
  return job.id ?? '';
}

export async function closeQueues(): Promise<void> {
  await Promise.all(Array.from(queues.values()).map((q) => q.close()));
  connection.disconnect();
}
