import { twiml } from 'twilio';
import { formatDeliveryDate } from './mapping';

const { VoiceResponse } = twiml;
const VOICE = { voice: 'Polly.Aditi', language: 'en-IN' } as const;

export interface VoiceTwimlInput {
  name: string;
  company: string;
  product: string;
  date: string;
  attempt: number;
  baseUrl: string;
  deliveryId?: string;
}

/** Initial (or repeated) IVR question with DTMF and speech input enabled. */
export function buildVoiceTwiml(input: VoiceTwimlInput): string {
  const response = new VoiceResponse();
  const attempt = Math.min(Math.max(input.attempt, 1), 2);

  if (attempt === 2) {
    response.say(VOICE, 'Sorry, I did not catch that. Let me repeat the question.');
  }

  const prompt =
    `Hello ${input.name}, this is ${input.company} calling about your order of ` +
    `${input.product} delivered on ${formatDeliveryDate(input.date)}. ` +
    'If you received it, press 1 or say Yes. If not, press 2 or say No.';

  const deliveryParam = input.deliveryId
    ? `&deliveryId=${encodeURIComponent(input.deliveryId)}`
    : '';

  type GatherAttributes = NonNullable<Parameters<typeof response.gather>[0]>;

  // Twilio only accepts a single `language` value. Multi-language recognition is
  // available with the Deepgram nova-3 model, which lets us accept English and
  // Hindi yes/no answers in the same Gather. The installed SDK's language union
  // predates "multi", so only that field needs widening.
  const gatherAttributes: GatherAttributes = {
    input: ['dtmf', 'speech'],
    numDigits: 1,
    timeout: 5,
    speechTimeout: '3',
    speechModel: 'deepgram_nova-3',
    language: 'multi' as unknown as GatherAttributes['language'],
    hints: 'yes, no, haan, nahi, ji haan, nahi mila, received, not received',
    actionOnEmptyResult: true,
    action: `${input.baseUrl}/webhooks/twilio/gather?attempt=${attempt}${deliveryParam}`,
    method: 'POST',
  };

  const gather = response.gather(gatherAttributes);
  gather.say(VOICE, prompt);

  response.say(VOICE, 'Thank you for your time. Goodbye.');
  response.hangup();

  return response.toString();
}

/** Final thank-you message before hanging up. */
export function buildGoodbyeTwiml(positive: boolean): string {
  const response = new VoiceResponse();
  response.say(
    VOICE,
    positive
      ? 'Thank you for confirming your delivery. Have a great day. Goodbye.'
      : 'Thank you for letting us know. We will follow up with you. Goodbye.',
  );
  response.hangup();
  return response.toString();
}

/** Ask the caller to repeat the question once. */
export function buildRepeatTwiml(baseUrl: string, deliveryId?: string): string {
  const response = new VoiceResponse();
  response.say(VOICE, 'Let me ask that again.');
  const deliveryParam = deliveryId ? `&deliveryId=${encodeURIComponent(deliveryId)}` : '';
  response.redirect({ method: 'POST' }, `${baseUrl}/webhooks/twilio/voice?attempt=2${deliveryParam}`);
  return response.toString();
}

/** Final message when the caller never provided a usable answer. */
export function buildNoInputGoodbyeTwiml(): string {
  const response = new VoiceResponse();
  response.say(VOICE, 'Thank you for your time. We will try reaching you later. Goodbye.');
  response.hangup();
  return response.toString();
}

export function emptyTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response/>';
}
