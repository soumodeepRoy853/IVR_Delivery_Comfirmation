import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRecordingUrl } from '../src/recording';

test('only Twilio HTTPS recording URLs are accepted', () => {
  assert.equal(
    normalizeRecordingUrl('https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123'),
    'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123',
  );
  assert.equal(normalizeRecordingUrl('http://api.twilio.com/Recordings/RE123'), null);
  assert.equal(normalizeRecordingUrl('https://evil.example.com/RE123'), null);
  assert.equal(normalizeRecordingUrl('not a url'), null);
  assert.equal(normalizeRecordingUrl(null), null);
});
