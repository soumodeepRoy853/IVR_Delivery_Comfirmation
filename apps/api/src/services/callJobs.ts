import type { Job } from 'bullmq';
import { config } from '../config';
import { query, withTransaction } from '../db';
import type { CallJobPayload } from '../queue/callQueue';
import { telephonyProvider } from '../telephony';
import type { DeliveryStatus } from '../types';
import { getDelivery } from './deliveries';

/** Places the call (at most once per job) and records the provider call id. */
export async function processCallJob(job: Job<CallJobPayload, unknown, string>): Promise<void> {
  const payload = job.data;
  const delivery = await getDelivery(payload.deliveryId);
  if (!delivery) return;

  try {
    let providerCallId = payload.providerCallId;
    let providerStatus = payload.providerStatus ?? 'queued';

    if (!providerCallId) {
      const result = await telephonyProvider.placeCall({
        deliveryId: payload.deliveryId,
        to: payload.to,
        promptUrl: `${config.publicBaseUrl}/webhooks/twilio/voice?deliveryId=${payload.deliveryId}`,
        statusCallbackUrl: `${config.publicBaseUrl}/webhooks/twilio/status?deliveryId=${payload.deliveryId}`,
        record: true,
        outcome: telephonyProvider.name === 'mock' ? payload.outcome : undefined,
      });
      providerCallId = result.providerCallId;
      providerStatus = result.providerStatus;

      // Persist the SID on the job before touching the DB so a retry cannot place a second call.
      await job.updateData({ ...payload, providerCallId, providerStatus });
    }

    await query(
      `INSERT INTO call_logs
         (delivery_id, provider_call_id, started_at, outcome, provider_status, raw_payload)
       VALUES ($1, $2, now(), 'pending', $3, $4)
       ON CONFLICT (provider_call_id) DO NOTHING`,
      [payload.deliveryId, providerCallId, providerStatus, JSON.stringify({ jobId: job.id, providerCallId })],
    );
  } catch (error) {
    if (job.attemptsMade + 1 < config.callRetryAttempts) throw error;
    await markCallFailed(payload.deliveryId, payload.previousStatus, String(job.id), error);
  }
}

/** Returns the delivery to its previous status when all provider attempts failed. */
export async function markCallFailed(
  deliveryId: string,
  previousStatus: DeliveryStatus,
  jobId: string,
  error: unknown,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE deliveries SET status = $2, updated_at = now()
        WHERE id = $1 AND status = 'calling'`,
      [deliveryId, previousStatus],
    );
    await client.query(
      `INSERT INTO call_logs
         (delivery_id, provider_call_id, started_at, ended_at, outcome, provider_status, raw_payload)
       VALUES ($1, $2, now(), now(), 'no_answer_failed', 'placement_failed', $3)
       ON CONFLICT (provider_call_id) DO NOTHING`,
      [deliveryId, `failed-${jobId}`, JSON.stringify({ error: String(error) })],
    );
  });
}
