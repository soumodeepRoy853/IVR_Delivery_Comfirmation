import { twiml } from 'twilio';
import { formatDeliveryDate } from './mapping';

const { VoiceResponse } = twiml;

export interface VoiceTwimlInput {
  name: string;
  company: string;
  product: string;
  date: string;
  attempt: number;
  baseUrl: string;
}

/** Initial (or repeated) IVR question with DTMF and speech input enabled. */
export function buildVoiceTwiml(input: VoiceTwimlInput): string {
  const response = new VoiceResponse();
  const attempt = Math.min(Math.max(input.attempt, 1), 2);

  if (attempt === 2) {
    response.say('Sorry, I did not catch that. Let me repeat the question.', {
      voice: 'Polly.Aditi',
      language: 'en-IN',
    });
  }

  const prompt =
    `Hello ${input.name}, this is ${input.company} calling about your order of ` +
    `${input.product} delivered on ${formatDeliveryDate(input.date)}. ` +
    'If you received it, press 1 or say Yes. If not, press 2 or say No.';

  const gather = response.gather({
    input: ['dtmf', 'speech'],
    numDigits: 1,
    timeout: 5,
    speechTimeout: 'auto',
    language: 'en-IN',
    speechLanguage: 'en-IN hi-IN',
    action: `${input.baseUrl}/webhooks/twilio/gather?attempt=${attempt}`,
    method: 'POST',
  });
  gather.say(prompt, { voice: 'Polly.Aditi', language: 'en-IN' });

  response.say('Thank you for your time. Goodbye.', { voice: 'Polly.Aditi', language: 'en-IN' });
  response.hangup();

  return response.toString();
}

/** Final thank-you message before hanging up. */
export function buildGoodbyeTwiml(positive: boolean): string {
  const response = new VoiceResponse();
  response.say(
    positive
      ? 'Thank you for confirming your delivery. Have a great day. Goodbye.'
      : 'Thank you for letting us know. We will follow up with you. Goodbye.',
    { voice: 'Polly.Aditi', language: 'en-IN' },
  );
  response.hangup();
  return response.toString();
}

/** Ask the caller to repeat the question once. */
export function buildRepeatTwiml(baseUrl: string): string {
  const response = new VoiceResponse();
  response.say('Let me ask that again.', { voice: 'Polly.Aditi', language: 'en-IN' });
  response.redirect(`${baseUrl}/webhooks/twilio/voice?attempt=2`, { method: 'POST' });
  return response.toString();
}

export function emptyTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response/>';
}
