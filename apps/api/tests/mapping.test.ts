import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDeliveryDate,
  interpretInput,
  mapProviderCallStatus,
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
