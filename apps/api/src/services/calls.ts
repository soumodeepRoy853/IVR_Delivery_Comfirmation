import { config } from '../config';
import { query, withTransaction } from '../db';
import { interpretInput, mapProviderCallStatus, parseDuration } from '../ivr/mapping';
import {
  buildGoodbyeTwiml,
  buildNoInputGoodbyeTwiml,
  buildRepeatTwiml,
  emptyTwiml,
} from '../ivr/twiml';
import { getCallByProviderSid, getDeliveryByCallSid } from './deliveries';
import type { CallOutcome, DeliveryWithCalls } from '../types';

/**
 * Finds the delivery for a call. A provider webhook can arrive before the worker has
 * inserted the call log, so the delivery id carried in the webhook URL is a fallback.
 */
async function findDelivery(callSid: string, deliveryId?: string): Promise<DeliveryWithCalls | null> {
  let delivery = await getDeliveryByCallSid(callSid);
  if (!delivery && deliveryId) {
    await query(
      `INSERT INTO call_logs (delivery_id, provider_call_id, started_at, outcome, provider_status)
       VALUES ($1, $2, now(), 'pending', 'webhook-before-log')
       ON CONFLICT (provider_call_id) DO NOTHING`,
      [deliveryId, callSid],
    );
    delivery = await getDeliveryByCallSid(callSid);
  }
  return delivery;
}

/** Handles a DTMF/speech webhook and returns the TwiML response. */
export async function applyGather(
  callSid: string,
  input: { digits?: string | null; speech?: string | null },
  attempt: number,
  deliveryId?: string,
): Promise<string> {
  const delivery = await findDelivery(callSid, deliveryId);
  if (!delivery) return emptyTwiml();

  const call = await getCallByProviderSid(callSid);
  if (!call || call.outcome !== 'pending') {
    // A response was already recorded; never overwrite it with a duplicate callback.
    return buildGoodbyeTwiml(true);
  }

  const interpretation = interpretInput(input);

  if (interpretation.status) {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE call_logs
            SET outcome = $2, raw_input = $3, provider_status = 'completed', ended_at = now()
          WHERE provider_call_id = $1 AND outcome = 'pending'`,
        [callSid, interpretation.outcome, interpretation.rawInput],
      );
      await client.query(
        `UPDATE deliveries SET status = $2, updated_at = now()
          WHERE id = $1 AND status = 'calling'`,
        [delivery.id, interpretation.status],
      );
    });
    return buildGoodbyeTwiml(interpretation.status === 'received');
  }

  if (attempt < 2) {
    // Keep the attempt pending so the second gather can finalise the outcome.
    await query(
      `UPDATE call_logs SET raw_input = $2
        WHERE provider_call_id = $1 AND outcome = 'pending'`,
      [callSid, interpretation.rawInput],
    );
    return buildRepeatTwiml(config.publicBaseUrl, deliveryId);
  }

  const finalOutcome: CallOutcome = interpretation.outcome === 'invalid_input' ? 'invalid_input' : 'no_input';
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE call_logs SET outcome = $2, raw_input = $3, ended_at = now()
        WHERE provider_call_id = $1 AND outcome = 'pending'`,
      [callSid, finalOutcome, interpretation.rawInput],
    );
    await client.query(
      `UPDATE deliveries SET status = 'no_answer_failed', updated_at = now()
        WHERE id = $1 AND status = 'calling'`,
      [delivery.id],
    );
  });
  return buildNoInputGoodbyeTwiml();
}

/** Handles provider call-status callbacks (ringing, completed, no-answer, busy, failed). */
export async function applyStatus(
  callSid: string,
  body: Record<string, unknown>,
  deliveryId?: string,
): Promise<void> {
  const delivery = await findDelivery(callSid, deliveryId);
  if (!delivery) return;

  const providerStatus = String(body.CallStatus ?? '').toLowerCase();
  const mappedStatus = mapProviderCallStatus(providerStatus);
  const duration = parseDuration(body.CallDuration);
  const recordingUrl = typeof body.RecordingUrl === 'string' ? body.RecordingUrl : null;
  const isFinal = mappedStatus !== null || providerStatus === 'completed';

  const current = await getCallByProviderSid(callSid);
  let nextOutcome: CallOutcome | null = null;
  if (current?.outcome === 'pending') {
    if (mappedStatus) nextOutcome = 'no_answer_failed';
    else if (providerStatus === 'completed') nextOutcome = 'no_input';
  }
  // A completed call without a recorded answer is a failed confirmation. The
  // WHERE status = 'calling' guard below keeps an already answered delivery intact.
  const finalStatus = mappedStatus ?? (providerStatus === 'completed' ? 'no_answer_failed' : null);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE call_logs
          SET ended_at = CASE WHEN $2 THEN now() ELSE ended_at END,
              duration_seconds = COALESCE($3, duration_seconds),
              provider_status = $4,
              raw_payload = $5,
              recording_url = COALESCE($6, recording_url),
              outcome = COALESCE($7::call_outcome, outcome)
        WHERE provider_call_id = $1`,
      [callSid, isFinal, duration, providerStatus, JSON.stringify(body), recordingUrl, nextOutcome],
    );

    if (finalStatus) {
      await client.query(
        `UPDATE deliveries SET status = $2, updated_at = now()
          WHERE id = $1 AND status = 'calling'`,
        [delivery.id, finalStatus],
      );
    }
  });
}
