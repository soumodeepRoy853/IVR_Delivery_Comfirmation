import { config } from '../config';
import { query, withTransaction } from '../db';
import { interpretInput, mapProviderCallStatus, parseDuration } from '../ivr/mapping';
import {
  buildGoodbyeTwiml,
  buildNoInputGoodbyeTwiml,
  buildRepeatTwiml,
  emptyTwiml,
} from '../ivr/twiml';
import { getDeliveryByCallSid } from './deliveries';
import type { CallOutcome } from '../types';

/** Handles a DTMF/speech webhook and returns the TwiML response. */
export async function applyGather(
  callSid: string,
  input: { digits?: string | null; speech?: string | null },
  attempt: number,
): Promise<string> {
  const delivery = await getDeliveryByCallSid(callSid);
  if (!delivery) return emptyTwiml();

  const call = delivery.calls[0];
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
    return buildRepeatTwiml(config.publicBaseUrl);
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
export async function applyStatus(callSid: string, body: Record<string, unknown>): Promise<void> {
  const delivery = await getDeliveryByCallSid(callSid);
  if (!delivery) return;

  const providerStatus = String(body.CallStatus ?? '').toLowerCase();
  const mappedStatus = mapProviderCallStatus(providerStatus);
  const duration = parseDuration(body.CallDuration);
  const recordingUrl = typeof body.RecordingUrl === 'string' ? body.RecordingUrl : null;
  const isFinal = mappedStatus !== null || providerStatus === 'completed';

  const current = delivery.calls[0];
  let nextOutcome: CallOutcome | null = null;
  if (current?.outcome === 'pending') {
    if (mappedStatus) nextOutcome = 'no_answer_failed';
    else if (providerStatus === 'completed') nextOutcome = 'no_input';
  }

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

    if (mappedStatus) {
      await client.query(
        `UPDATE deliveries SET status = $2, updated_at = now()
          WHERE id = $1 AND status = 'calling'`,
        [delivery.id, mappedStatus],
      );
    }
  });
}
