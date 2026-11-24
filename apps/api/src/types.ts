export const DELIVERY_STATUSES = [
  'not_called',
  'calling',
  'received',
  'not_received',
  'no_answer_failed',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  not_called: 'Not called',
  calling: 'Calling',
  received: 'Received',
  not_received: 'Not received',
  no_answer_failed: 'No answer / Failed',
};

export const CALL_OUTCOMES = [
  'pending',
  'received',
  'not_received',
  'no_answer_failed',
  'no_input',
  'invalid_input',
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export interface Delivery {
  id: string;
  order_id: string;
  customer_name: string;
  phone_e164: string;
  product: string;
  delivery_date: string;
  status: DeliveryStatus;
  last_call_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  delivery_id: string;
  provider_call_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  outcome: CallOutcome;
  raw_input: string | null;
  provider_status: string | null;
  raw_payload: Record<string, unknown> | null;
  recording_url: string | null;
  created_at: string;
}

export interface DeliveryWithCalls extends Delivery {
  calls: CallLog[];
}
