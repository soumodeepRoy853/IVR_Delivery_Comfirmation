import type { CallOutcome, DeliveryStatus } from '../types';

export interface InputInterpretation {
  outcome: CallOutcome;
  status: DeliveryStatus | null;
  rawInput: string;
}

const YES_PATTERN = /(^|\b)(yes|ya|haan|han|ha|theek|thik|bilkul|confirm|confirmed|received|mil\s*gaya|mil\s*gayi|aa\s*gaya|ji\s*haan|हाँ|हां|हाँजी)([\s!.?]|$)/i;
const NO_PATTERN = /(^|\b)(no|nahi|nahin|na|not\s+received|nahi\s+mila|nahin\s+mila|wrong|galat|ना|नहीं)([\s!.?]|$)/i;

function normaliseSpeech(speech: string): string {
  return speech
    .trim()
    .toLowerCase()
    .replace(/[.,!?"']/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Maps a keypress or speech transcript to a delivery status and call outcome. */
export function interpretInput(input: { digits?: string | null; speech?: string | null }): InputInterpretation {
  const digits = (input.digits ?? '').trim();
  const speech = normaliseSpeech(input.speech ?? '');
  const rawInput = digits || speech || 'no-input';

  if (digits === '1' || (speech && YES_PATTERN.test(speech) && !NO_PATTERN.test(speech))) {
    return { outcome: 'received', status: 'received', rawInput };
  }
  if (digits === '2' || (speech && NO_PATTERN.test(speech))) {
    return { outcome: 'not_received', status: 'not_received', rawInput };
  }
  if (digits || speech) {
    return { outcome: 'invalid_input', status: null, rawInput };
  }
  return { outcome: 'no_input', status: null, rawInput };
}

/** Maps a stored call outcome to the delivery status it implies, or null while pending. */
export function deliveryStatusForOutcome(outcome: CallOutcome): DeliveryStatus | null {
  switch (outcome) {
    case 'received':
      return 'received';
    case 'not_received':
      return 'not_received';
    case 'no_answer_failed':
    case 'no_input':
    case 'invalid_input':
      return 'no_answer_failed';
    default:
      return null;
  }
}

/** Reads the IVR attempt query parameter, defaulting to the first question. */
export function parseAttempt(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 2 ? parsed : 1;
}

/** Maps a telephony call-status callback to a delivery status, or null if not terminal. */
export function mapProviderCallStatus(callStatus: string): DeliveryStatus | null {
  switch (callStatus.toLowerCase().trim()) {
    case 'no-answer':
    case 'busy':
    case 'failed':
    case 'canceled':
    case 'cancelled':
    case 'undialed':
      return 'no_answer_failed';
    default:
      return null;
  }
}

export function parseDuration(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

export function formatDeliveryDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}
