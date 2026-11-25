import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deliveryStatusForOutcome,
  formatDeliveryDate,
  interpretInput,
  mapProviderCallStatus,
  parseAttempt,
  parseDuration,
} from '../src/ivr/mapping';

test('DTMF 1 and 2 map to received and not received', () => {
  assert.deepEqual(interpretInput({ digits: '1' }), {
    outcome: 'received',
    status: 'received',
    rawInput: '1',
  });
  assert.deepEqual(interpretInput({ digits: '2' }), {
    outcome: 'not_received',
    status: 'not_received',
    rawInput: '2',
  });
});

test('English and Hindi speech maps to the right status', () => {
  assert.equal(interpretInput({ speech: 'Yes, I received it.' }).status, 'received');
  assert.equal(interpretInput({ speech: 'haan ji' }).status, 'received');
  assert.equal(interpretInput({ speech: 'हाँ' }).status, 'received');
  assert.equal(interpretInput({ speech: 'No' }).status, 'not_received');
  assert.equal(interpretInput({ speech: 'nahi mila' }).status, 'not_received');
  assert.equal(interpretInput({ speech: 'नहीं' }).status, 'not_received');
});

test('invalid and empty input do not change the delivery status', () => {
  assert.deepEqual(interpretInput({ digits: '9' }), {
    outcome: 'invalid_input',
    status: null,
    rawInput: '9',
  });
  assert.deepEqual(interpretInput({}), {
    outcome: 'no_input',
    status: null,
    rawInput: 'no-input',
  });
});

test('failed provider statuses map to No answer / Failed', () => {
  for (const status of ['no-answer', 'busy', 'failed', 'canceled', 'undialed']) {
    assert.equal(mapProviderCallStatus(status), 'no_answer_failed', status);
  }
  assert.equal(mapProviderCallStatus('completed'), null);
  assert.equal(mapProviderCallStatus('answered'), null);
});

test('duration parsing ignores empty and invalid values', () => {
  assert.equal(parseDuration('27'), 27);
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration('abc'), null);
});

test('delivery dates are formatted in IST-friendly form', () => {
  assert.equal(formatDeliveryDate('2026-11-24'), '24 November 2026');
});

test('final call outcomes reconcile the delivery status', () => {
  assert.equal(deliveryStatusForOutcome('pending'), null);
  assert.equal(deliveryStatusForOutcome('received'), 'received');
  assert.equal(deliveryStatusForOutcome('not_received'), 'not_received');
  for (const outcome of ['no_answer_failed', 'no_input', 'invalid_input'] as const) {
    assert.equal(deliveryStatusForOutcome(outcome), 'no_answer_failed');
  }
});

test('invalid IVR attempt values fall back to the first question', () => {
  assert.equal(parseAttempt(undefined), 1);
  assert.equal(parseAttempt('1'), 1);
  assert.equal(parseAttempt('2'), 2);
  assert.equal(parseAttempt('9'), 1);
  assert.equal(parseAttempt('abc'), 1);
});
