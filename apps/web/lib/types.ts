export const STATUSES = [
  'not_called',
  'calling',
  'received',
  'not_received',
  'no_answer_failed',
] as const;

export type DeliveryStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  not_called: 'Not called',
  calling: 'Calling',
  received: 'Received',
  not_received: 'Not received',
  no_answer_failed: 'No answer / Failed',
};

export interface CallLog {
  id: string;
  provider_call_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  outcome: string;
  raw_input: string | null;
  provider_status: string | null;
  recording_url: string | null;
}

export interface Delivery {
  id: string;
  order_id: string;
  customer_name: string;
  phone_e164: string;
  product: string;
  delivery_date: string;
  status: DeliveryStatus;
  last_call_at: string | null;
  calls: CallLog[];
}
