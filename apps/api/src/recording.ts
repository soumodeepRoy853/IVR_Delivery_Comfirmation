/** Twilio recording URLs must be fetched from Twilio itself, never from a caller-supplied host. */
export function normalizeRecordingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'api.twilio.com') return null;
    return url.toString();
  } catch {
    return null;
  }
}
