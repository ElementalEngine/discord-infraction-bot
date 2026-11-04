import assert from 'node:assert/strict';
import { test } from 'node:test';

import './env.js';

const { failureOf, Refusal } = await import('../src/ui/failure.js');
const { ApiError, NoAnswer } = await import('../src/api/errors.js');

const api = (status: number, code: string, retryable = false) =>
  new ApiError(status, { detail: { error: { code, message: `${code} message`, retryable, correlation_id: 'abc123' } } });

test("core-api's refusal is shown as written, with its reference", () => {
  assert.deepEqual(failureOf(api(409, 'STILL_SUSPENDED')), { text: '‼️ STILL_SUSPENDED message', ours: false });
});

test('no answer says the write may have landed, so staff check before repeating it', () => {
  assert.match(failureOf(new NoAnswer(new TypeError('terminated'))).text, /may or may not be recorded/);
  assert.match(failureOf(api(500, 'INTERNAL')).text, /may or may not be recorded.*\(ref abc123\)$/);
  assert.match(failureOf(new ApiError(502, '<html>')).text, /may or may not be recorded/);
});

test('a refused token or a bad request is ours and asks for a developer', () => {
  for (const status of [401, 422, 503]) {
    const failure = failureOf(api(status, 'AUTH'));
    assert.equal(failure.ours, true);
    assert.match(failure.text, /Tell a developer/);
  }
});

test("a rule the staff member broke is said back, and an unknown error is ours with a reference", () => {
  assert.deepEqual(failureOf(new Refusal('Only staff can use this command.')), { text: '‼️ Only staff can use this command.', ours: false });
  const unknown = failureOf(new Error('boom'));
  assert.equal(unknown.ours, true);
  assert.match(unknown.text, /\(ref [0-9a-f]{6}\)$/);
});
