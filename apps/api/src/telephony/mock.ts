import { randomUUID } from 'node:crypto';
import { config } from '../config';
import type { PlaceCallInput, PlaceCallResult, TelephonyProvider } from './types';

type MockOutcome = 'received' | 'not_received' | 'no_answer' | 'timeout';

const KNOWN_OUTCOMES: MockOutcome[] = ['received', 'not_received', 'no_answer', 'timeout'];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Posts form-encoded data to our own webhook endpoints, exactly like a real provider would. */
async function postWebhook(path: string, body: Record<string, string>): Promise<void> {
  try {
    const response = await fetch(`${config.publicBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-mock-webhook': 'true',
      },
      body: new URLSearchParams(body).toString(),
    });
    if (!response.ok) {
      console.warn(`Mock webhook ${path} returned ${response.status}`);
    }
  } catch (error) {
    console.warn(`Mock webhook ${path} failed:`, error);
  }
}

async function simulate(callSid: string, outcome: MockOutcome, deliveryId: string): Promise<void> {
  const deliveryParam = `?deliveryId=${encodeURIComponent(deliveryId)}`;
  await delay(1800);

  if (outcome === 'no_answer') {
    await postWebhook(`/webhooks/twilio/status${deliveryParam}`, {
      CallSid: callSid,
      CallStatus: 'no-answer',
      CallDuration: '0',
    });
    return;
  }

  if (outcome === 'timeout') {
    await postWebhook(`/webhooks/twilio/gather?attempt=1${deliveryParam}`, { CallSid: callSid, Digits: '' });
    await delay(1200);
    await postWebhook(`/webhooks/twilio/gather?attempt=2${deliveryParam}`, { CallSid: callSid, Digits: '' });
  } else {
    await postWebhook(`/webhooks/twilio/gather?attempt=1${deliveryParam}`, {
      CallSid: callSid,
      Digits: outcome === 'received' ? '1' : '2',
    });
  }

  await delay(300);
  await postWebhook(`/webhooks/twilio/status${deliveryParam}`, {
    CallSid: callSid,
    CallStatus: 'completed',
    CallDuration: '24',
  });
}

export const mockProvider: TelephonyProvider = {
  name: 'mock',

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const requested = (input.outcome ?? config.mockOutcome).toLowerCase() as MockOutcome;
    const outcome = KNOWN_OUTCOMES.includes(requested) ? requested : 'received';
    const providerCallId = `mock-${randomUUID()}`;

    // Fire-and-forget simulation so the API can respond immediately.
    void simulate(providerCallId, outcome, input.deliveryId);

    return { providerCallId, providerStatus: 'queued' };
  },
};
