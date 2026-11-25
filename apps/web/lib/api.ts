import type { Delivery, DeliveryStatus } from './types';

// All browser calls go through Next.js route handlers, which add server-side credentials.
const API_BASE = '';

export interface DeliveriesResponse {
  deliveries: Delivery[];
}

export async function fetchDeliveries(status: DeliveryStatus | 'all'): Promise<DeliveriesResponse> {
  const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
  const response = await fetch(`${API_BASE}/api/deliveries${query}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load deliveries (${response.status})`);
  return response.json() as Promise<DeliveriesResponse>;
}

export async function callDelivery(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/deliveries/${encodeURIComponent(id)}/call`, {
    method: 'POST',
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Call failed (${response.status})`);
  }
}

export interface BulkCallResult {
  started: number;
  failed: Array<{ id: string; reason: string | null }>;
}

export async function bulkCall(ids: string[]): Promise<BulkCallResult> {
  const response = await fetch(`${API_BASE}/api/deliveries/bulk-call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Bulk call failed (${response.status})`);
  }
  return response.json() as Promise<BulkCallResult>;
}
