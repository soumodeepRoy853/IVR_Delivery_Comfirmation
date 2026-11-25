'use client';

import type { CallLog } from '@/lib/types';

const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const OUTCOME_LABELS: Record<string, string> = {
  pending: 'In progress',
  received: 'Received',
  not_received: 'Not received',
  no_answer_failed: 'No answer / Failed',
  no_input: 'No input / Timeout',
  invalid_input: 'Invalid input',
};

export function CallLogPanel({ calls }: { calls: CallLog[] }) {
  if (calls.length === 0) {
    return <p className="empty-log">No calls have been made for this delivery yet.</p>;
  }

  return (
    <div className="call-log">
      <h4>Call history</h4>
      <table className="log-table">
        <thead>
          <tr>
            <th>Time (IST)</th>
            <th>Duration</th>
            <th>Outcome</th>
            <th>Raw input</th>
            <th>Provider status</th>
            <th>Recording</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr key={call.id}>
              <td>{dateTime.format(new Date(call.started_at))}</td>
              <td>{call.duration_seconds != null ? `${call.duration_seconds}s` : '—'}</td>
              <td>{OUTCOME_LABELS[call.outcome] ?? call.outcome}</td>
              <td>{call.raw_input ?? '—'}</td>
              <td>{call.provider_status ?? '—'}</td>
              <td>
                {call.recording_url ? (
                  <a href={`/api/recording/${encodeURIComponent(call.id)}`} target="_blank" rel="noreferrer">
                    Listen
                  </a>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
