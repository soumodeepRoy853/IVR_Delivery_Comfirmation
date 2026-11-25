import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBasicAuth } from '../src/auth';

test('basic auth headers decode to credentials', () => {
  const header = `Basic ${Buffer.from('telecaller:secret').toString('base64')}`;
  assert.deepEqual(parseBasicAuth(header), { username: 'telecaller', password: 'secret' });
});

test('malformed basic auth headers are rejected', () => {
  assert.equal(parseBasicAuth(undefined), null);
  assert.equal(parseBasicAuth('Bearer token'), null);
  assert.equal(parseBasicAuth(`Basic ${Buffer.from('no-colon').toString('base64')}`), null);
});
