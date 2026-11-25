'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { bulkCall, callDelivery, fetchDeliveries } from '@/lib/api';
import {
  STATUSES,
  STATUS_LABELS,
  type Delivery,
  type DeliveryStatus,
} from '@/lib/types';
import { CallLogPanel } from './CallLogPanel';

type Filter = DeliveryStatus | 'all';

const lastCallFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export function DeliveriesDashboard() {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, isLoading, isValidating, mutate } = useSWR(
    ['deliveries', filter],
    () => fetchDeliveries(filter),
    { refreshInterval: 3000, revalidateOnFocus: true },
  );

  const deliveries = data?.deliveries ?? [];
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const delivery of deliveries) {
      result[delivery.status] = (result[delivery.status] ?? 0) + 1;
    }
    return result;
  }, [deliveries]);

  async function runAction(action: () => Promise<void>, key: string) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await mutate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  async function callSelected() {
    setBusy('bulk');
    setError(null);
    setNotice(null);
    try {
      const result = await bulkCall([...selected]);
      const failed = result.failed.length;
      setNotice(
        `Started ${result.started} call${result.started === 1 ? '' : 's'}.` +
          (failed > 0 ? ` ${failed} could not be started.` : ''),
      );
      await mutate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = deliveries.length > 0 && deliveries.every((delivery) => selected.has(delivery.id));

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">IVR delivery confirmation</p>
          <h1>Deliveries</h1>
          <p className="subtitle">
            Click Call to place an automated confirmation call. Results appear here automatically.
          </p>
        </div>
        <div className="header-status">
          <span className={`pulse ${isValidating ? 'active' : ''}`} />
          {isValidating ? 'Updating…' : 'Live'}
        </div>
      </header>

      <section className="toolbar" aria-label="Dashboard controls">
        <label>
          Status
          <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
            <option value="all">All statuses ({deliveries.length})</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="secondary"
          disabled={selected.size === 0 || busy !== null}
          onClick={callSelected}
        >
          Call selected ({selected.size})
        </button>
      </section>

      {error && <div className="alert" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      <section className="summary" aria-label="Status summary">
        {STATUSES.map((status) => (
          <div className={`summary-card status-${status}`} key={status}>
            <span>{STATUS_LABELS[status]}</span>
            <strong>{counts[status] ?? 0}</strong>
          </div>
        ))}
      </section>

      <section className="table-card">
        <table className="deliveries-table">
          <thead>
            <tr>
              <th aria-label="Select">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(deliveries.map((d) => d.id)))}
                />
              </th>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Product</th>
              <th>Delivery date</th>
              <th>Status</th>
              <th>Last call</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="empty">Loading deliveries…</td>
              </tr>
            )}
            {!isLoading && deliveries.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">No deliveries match this filter.</td>
              </tr>
            )}
            {deliveries.map((delivery: Delivery) => (
              <Row
                key={delivery.id}
                delivery={delivery}
                selected={selected.has(delivery.id)}
                expanded={expanded === delivery.id}
                busy={busy === delivery.id}
                onToggleSelected={() => toggleSelected(delivery.id)}
                onToggleExpanded={() => setExpanded(expanded === delivery.id ? null : delivery.id)}
                onCall={() => runAction(() => callDelivery(delivery.id), delivery.id)}
              />
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

interface RowProps {
  delivery: Delivery;
  selected: boolean;
  expanded: boolean;
  busy: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onCall: () => void;
}

function Row({ delivery, selected, expanded, busy, onToggleSelected, onToggleExpanded, onCall }: RowProps) {
  const calling = delivery.status === 'calling';
  return (
    <>
      <tr className={expanded ? 'row-expanded' : undefined}>
        <td><input type="checkbox" checked={selected} onChange={onToggleSelected} /></td>
        <td className="mono">{delivery.order_id}</td>
        <td>{delivery.customer_name}</td>
        <td className="mono">{delivery.phone_e164}</td>
        <td>{delivery.product}</td>
        <td>{delivery.delivery_date}</td>
        <td>
          <span className={`badge status-${delivery.status}`}>
            {STATUS_LABELS[delivery.status]}
          </span>
        </td>
        <td>
          {delivery.last_call_at
            ? lastCallFormat.format(new Date(delivery.last_call_at))
            : '—'}
        </td>
        <td className="actions">
          <button
            type="button"
            className="primary"
            disabled={calling || busy}
            onClick={onCall}
          >
            {busy ? 'Calling…' : calling ? 'Calling…' : 'Call'}
          </button>
          <button type="button" className="link" onClick={onToggleExpanded}>
            {expanded ? 'Hide log' : 'Log'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={9}><CallLogPanel calls={delivery.calls} /></td>
        </tr>
      )}
    </>
  );
}
