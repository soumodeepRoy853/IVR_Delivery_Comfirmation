import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGoodbyeTwiml,
  buildNoInputGoodbyeTwiml,
  buildRepeatTwiml,
  buildVoiceTwiml,
} from '../src/ivr/twiml';

const base = {
  name: 'Aarav Sharma',
  company: 'FastDeliver',
  product: 'Wireless Headphones',
  date: '2026-11-24',
  baseUrl: 'https://example.ngrok-free.app',
  deliveryId: 'delivery-123',
};

test('voice prompt is personalised and accepts DTMF and speech', () => {
  const xml = buildVoiceTwiml({ ...base, attempt: 1 });
  assert.match(xml, /Hello Aarav Sharma, this is FastDeliver calling/);
  assert.match(xml, /Wireless Headphones delivered on 24 November 2026/);
  assert.match(xml, /press 1 or say Yes/);
  assert.match(xml, /press 2 or say No/);
  assert.match(xml, /input="dtmf speech"/);
  assert.match(xml, /speechLanguage="en-IN hi-IN"/);
  assert.match(xml, /attempt=1(&amp;|&)deliveryId=delivery-123/);
});

test('second attempt repeats the question once', () => {
  const xml = buildVoiceTwiml({ ...base, attempt: 2 });
  assert.match(xml, /Let me repeat the question/);
  assert.match(xml, /attempt=2/);
});

test('repeat TwiML redirects to attempt 2', () => {
  const xml = buildRepeatTwiml(base.baseUrl);
  assert.match(xml, /Let me ask that again/);
  assert.match(xml, /webhooks\/twilio\/voice\?attempt=2/);
});

test('goodbye messages thank the customer before hanging up', () => {
  assert.match(buildGoodbyeTwiml(true), /Thank you for confirming/);
  assert.match(buildGoodbyeTwiml(false), /Thank you for letting us know/);
  assert.match(buildNoInputGoodbyeTwiml(), /Thank you for your time/);
  assert.match(buildNoInputGoodbyeTwiml(), /<Hangup\/>/);
});
