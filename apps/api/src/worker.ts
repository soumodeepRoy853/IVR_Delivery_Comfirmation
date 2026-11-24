import { Worker } from 'bullmq';
import { config } from './config';
import { CALLS_QUEUE_NAME, createRedisConnection, type CallJobPayload } from './queue/callQueue';
import { processCallJob } from './services/callJobs';

const worker = new Worker<CallJobPayload, unknown, string>(CALLS_QUEUE_NAME, processCallJob, {
  connection: createRedisConnection(),
  concurrency: config.callQueueConcurrency,
  limiter: {
    max: config.callQueueRateMax,
    duration: config.callQueueRateDurationMs,
  },
});

worker.on('completed', (job) => {
  console.log(`Call job ${job.id} completed for delivery ${job.data.deliveryId}`);
});

worker.on('failed', (job, error) => {
  console.warn(`Call job ${job?.id} failed (attempt ${job?.attemptsMade ?? '?'}):`, error);
});

worker.on('error', (error) => {
  console.error('Call worker error:', error);
});

console.log(
  `Call worker started (concurrency=${config.callQueueConcurrency}, ` +
    `rate=${config.callQueueRateMax}/${config.callQueueRateDurationMs}ms, provider=${config.telephonyProvider})`,
);

async function shutdown(): Promise<void> {
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
