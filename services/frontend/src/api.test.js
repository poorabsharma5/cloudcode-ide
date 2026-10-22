import test from 'node:test';
import assert from 'node:assert';
import { statusLabel, LANGUAGES } from './api.js';

test('statusLabel maps runner statuses', () => {
  assert.strictEqual(statusLabel('success'), 'Finished');
  assert.strictEqual(statusLabel('timeout'), 'Timed out (10s limit)');
});

test('every language has a starter program', () => {
  for (const l of Object.values(LANGUAGES)) assert.ok(l.starter.length > 0);
});
