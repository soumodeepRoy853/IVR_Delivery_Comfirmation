import twilio from 'twilio';
import { config } from '../config';
import type { PlaceCallInput, PlaceCallResult, TelephonyProvider } from './types';

function client() {
  return twilio(config.twilioAccountSid, config.twilioAuthToken);
}

export const twilioProvider: TelephonyProvider = {
  name: 'twilio',

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const call = await client().calls.create({
      to: input.to,
      from: config.twilioFromNumber,
      url: input.promptUrl,
      method: 'POST',
      statusCallback: input.statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      record: input.record ?? true,
    });

    return { providerCallId: call.sid, providerStatus: call.status };
  },
};

/** Validates the X-Twilio-Signature header against the full requested URL and POST body. */
export function isValidTwilioSignature(
  fullUrl: string,
  signature: string | undefined,
  body: Record<string, unknown>,
): boolean {
  if (!signature) return false;
  try {
    return twilio.validateRequest(config.twilioAuthToken, signature, fullUrl, body);
  } catch {
    return false;
  }
}
