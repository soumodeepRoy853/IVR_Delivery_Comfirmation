import type { Delivery, DeliveryStatus } from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export interface DeliveriesResponse {
  deliveries: Delivery[];
}

export async function fetchDeliveries(status: DeliveryStatus | 'all'): Promise<DeliveriesResponse> {
  const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
  const response = await fetch(`${API_BASE}/api/deliveries${query}`);
  if (!response.ok) throw new Error(`Could not load deliveries (${response.status})`);
  return response.json() as Promise<DeliveriesResponse>;
}

export async function callDelivery(id: string, mockOutcome?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/deliveries/${encodeURIComponent(id)}/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mockOutcome ? { outcome: mockOutcome } : {}),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Call failed (${response.status})`);
  }
}

export async function bulkCall(ids: string[], mockOutcome?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/deliveries/bulk-call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, outcome: mockOutcome }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Bulk call failed (${response.status})`);
  }
}
