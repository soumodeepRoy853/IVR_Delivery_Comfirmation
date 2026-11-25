import { Router } from 'express';
import { config } from '../config';
import { asyncHandler, HttpError } from '../http';
import { normalizeRecordingUrl } from '../recording';
import { getCallLogById } from '../services/deliveries';

export const recordingsRouter = Router();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Streams a Twilio recording using server-side credentials. The browser never sees
 * the auth token, so the dashboard's "Listen" link does not trigger Twilio's Basic
 * auth prompt.
 */
recordingsRouter.get(
  '/:callId',
  asyncHandler(async (req, res) => {
    const callId = req.params.callId;
    if (!UUID_PATTERN.test(callId)) throw new HttpError('Invalid call id', 400);

    const call = await getCallLogById(callId);
    if (!call) throw new HttpError('Call log not found', 404);

    const recordingUrl = normalizeRecordingUrl(call.recording_url);
    if (!recordingUrl) throw new HttpError('Recording not available', 404);

    let recording: Response;
    try {
      const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
      recording = await fetch(recordingUrl, { headers: { authorization: `Basic ${auth}` } });
    } catch {
      throw new HttpError('Could not reach the recording provider', 502);
    }
    if (!recording.ok) throw new HttpError('Recording could not be loaded', 502);

    res.setHeader('content-type', recording.headers.get('content-type') ?? 'audio/wav');
    res.setHeader('cache-control', 'private, max-age=3600');
    res.send(Buffer.from(await recording.arrayBuffer()));
  }),
);
