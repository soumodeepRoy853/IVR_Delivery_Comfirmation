import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config';
import type { DeliveryStatus } from '../types';

export const CALLS_QUEUE_NAME = 'ivr-calls';

export interface CallJobPayload {
  deliveryId: string;
  to: string;
  previousStatus: DeliveryStatus;
  outcome?: string;
  /** Set by the worker after the provider accepts the call, to avoid a duplicate call on retry. */
  providerCallId?: string;
  providerStatus?: string;
}

export function createRedisConnection(): Redis {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

const callQueue = new Queue<CallJobPayload, unknown, string>(CALLS_QUEUE_NAME, {
  connection: createRedisConnection(),
});

/** Enqueues an outbound call and returns the BullMQ job id. */
export async function enqueueCall(payload: CallJobPayload): Promise<string> {
  const job = await callQueue.add('place-call', payload, {
    attempts: config.callRetryAttempts,
    backoff: { type: 'exponential', delay: config.callRetryDelayMs },
    removeOnComplete: { age: 86_400, count: 1000 },
    removeOnFail: { age: 604_800 },
  });
  if (!job.id) throw new Error('Could not enqueue call job');
  return job.id;
}

export async function closeCallQueue(): Promise<void> {
  await callQueue.close();
}
