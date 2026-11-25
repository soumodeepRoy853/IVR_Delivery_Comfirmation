import { config } from '../config';
import { query, withTransaction } from '../db';
import { HttpError } from '../http';
import { deliveryStatusForOutcome } from '../ivr/mapping';
import { telephonyProvider } from '../telephony';
import type { CallLog, CallOutcome, DeliveryStatus, DeliveryWithCalls } from '../types';

const SELECT_COLUMNS = `
  d.id, d.order_id, d.customer_name, d.phone_e164, d.product,
  to_char(d.delivery_date, 'YYYY-MM-DD') AS delivery_date,
  d.status, d.last_call_at, d.created_at, d.updated_at,
  COALESCE(
    jsonb_agg(to_jsonb(c) ORDER BY c.started_at DESC) FILTER (WHERE c.id IS NOT NULL),
    '[]'::jsonb
  ) AS calls
`;

function iso(value: unknown): string | null {
  return value == null ? null : new Date(value as string).toISOString();
}

function serializeCall(call: Record<string, unknown>): CallLog {
  return {
    id: call.id as string,
    delivery_id: call.delivery_id as string,
    provider_call_id: call.provider_call_id as string,
    started_at: iso(call.started_at)!,
    ended_at: iso(call.ended_at),
    duration_seconds: call.duration_seconds == null ? null : Number(call.duration_seconds),
    outcome: call.outcome as CallOutcome,
    raw_input: (call.raw_input as string | null) ?? null,
    provider_status: (call.provider_status as string | null) ?? null,
    raw_payload: (call.raw_payload as Record<string, unknown> | null) ?? null,
    recording_url: (call.recording_url as string | null) ?? null,
    created_at: iso(call.created_at)!,
  };
}

function serialize(row: Record<string, unknown>): DeliveryWithCalls {
  const calls = (row.calls ?? []) as Record<string, unknown>[];
  return {
    id: row.id as string,
    order_id: row.order_id as string,
    customer_name: row.customer_name as string,
    phone_e164: row.phone_e164 as string,
    product: row.product as string,
    delivery_date: row.delivery_date as string,
    status: row.status as DeliveryStatus,
    last_call_at: iso(row.last_call_at),
    created_at: iso(row.created_at)!,
    updated_at: iso(row.updated_at)!,
    calls: calls.map(serializeCall),
  };
}

export async function listDeliveries(status?: DeliveryStatus): Promise<DeliveryWithCalls[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT ${SELECT_COLUMNS}
       FROM deliveries d
       LEFT JOIN call_logs c ON c.delivery_id = d.id
      WHERE ($1::text IS NULL OR d.status = $1::delivery_status)
      GROUP BY d.id, d.order_id, d.customer_name, d.phone_e164, d.product,
               d.delivery_date, d.status, d.last_call_at, d.created_at, d.updated_at
      ORDER BY d.created_at DESC`,
    [status ?? null],
  );
  return rows.map(serialize);
}

export async function getDelivery(id: string): Promise<DeliveryWithCalls | null> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT ${SELECT_COLUMNS}
       FROM deliveries d
       LEFT JOIN call_logs c ON c.delivery_id = d.id
      WHERE d.id = $1
      GROUP BY d.id, d.order_id, d.customer_name, d.phone_e164, d.product,
               d.delivery_date, d.status, d.last_call_at, d.created_at, d.updated_at`,
    [id],
  );
  return rows[0] ? serialize(rows[0]) : null;
}

export async function getDeliveryByCallSid(callSid: string): Promise<DeliveryWithCalls | null> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT ${SELECT_COLUMNS}
       FROM deliveries d
       JOIN call_logs c ON c.delivery_id = d.id
      WHERE c.provider_call_id = $1
      GROUP BY d.id, d.order_id, d.customer_name, d.phone_e164, d.product,
               d.delivery_date, d.status, d.last_call_at, d.created_at, d.updated_at`,
    [callSid],
  );
  return rows[0] ? serialize(rows[0]) : null;
}

/** Returns the log for this specific call, not just the delivery's latest call. */
export async function getCallByProviderSid(callSid: string): Promise<CallLog | null> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT * FROM call_logs WHERE provider_call_id = $1`,
    [callSid],
  );
  return rows[0] ? serializeCall(rows[0]) : null;
}

export async function getCallLogById(id: string): Promise<CallLog | null> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT * FROM call_logs WHERE id = $1`,
    [id],
  );
  return rows[0] ? serializeCall(rows[0]) : null;
}

export interface StartCallResult {
  delivery: DeliveryWithCalls;
  providerCallId: string;
}

/** Places an outbound call immediately and records the provider call id. */
export async function startCall(deliveryId: string): Promise<StartCallResult> {
  const existing = await getDelivery(deliveryId);
  if (!existing) throw new HttpError('Delivery not found', 404);
  if (existing.status === 'calling') throw new HttpError('A call is already in progress for this delivery', 409);

  // Surface the provider's own error (e.g. Twilio's "unverified number") to the UI
  // instead of turning it into a generic 500.
  const result = await telephonyProvider.placeCall({
    deliveryId,
    to: existing.phone_e164,
    promptUrl: `${config.publicBaseUrl}/webhooks/twilio/voice?deliveryId=${deliveryId}`,
    statusCallbackUrl: `${config.publicBaseUrl}/webhooks/twilio/status?deliveryId=${deliveryId}`,
    record: true,
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(`Could not place call: ${message}`, 400);
  });

  // A webhook may arrive before this insert completes and create the log itself,
  // so the insert is idempotent and we reconcile any answer it already recorded.
  let status: DeliveryStatus = 'calling';
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO call_logs (delivery_id, provider_call_id, started_at, outcome, provider_status, raw_payload)
       VALUES ($1, $2, now(), 'pending', $3, $4)
       ON CONFLICT (provider_call_id) DO NOTHING`,
      [deliveryId, result.providerCallId, result.providerStatus, JSON.stringify({ placeCallResult: result })],
    );

    const { rows } = await client.query<{ outcome: CallOutcome }>(
      `SELECT outcome FROM call_logs WHERE provider_call_id = $1`,
      [result.providerCallId],
    );
    const outcome = rows[0]?.outcome ?? 'pending';
    status = deliveryStatusForOutcome(outcome) ?? 'calling';

    const updated = await client.query(
      `UPDATE deliveries
          SET status = $2, last_call_at = now(), updated_at = now()
        WHERE id = $1 AND status <> 'calling'`,
      [deliveryId, status],
    );
    if (updated.rowCount === 0) {
      throw new HttpError('A call is already in progress for this delivery', 409);
    }
  });

  return {
    delivery: {
      ...existing,
      status,
      last_call_at: new Date().toISOString(),
    },
    providerCallId: result.providerCallId,
  };
}
