import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerErrorMessage } from '../tgcloud/lib/errors.js';

test('workerErrorMessage returns null for success', () => {
  assert.equal(workerErrorMessage({ ok: true }), null);
  assert.equal(workerErrorMessage(null), null);
});

test('workerErrorMessage maps unauthorized to the SHARED_SECRET fix', () => {
  const msg = workerErrorMessage({ ok: false, error: 'unauthorized' });
  assert.ok(msg.includes('SHARED_SECRET'));
  assert.ok(msg.includes('config.js'));
});

test('workerErrorMessage maps worker_unreachable to the WORKER_URL fix', () => {
  const msg = workerErrorMessage({ ok: false, error: 'worker_unreachable' });
  assert.ok(msg.includes('WORKER_URL'));
  assert.ok(msg.includes('wrangler deploy'));
});

test('workerErrorMessage maps AI failures to the Cloudflare log hint', () => {
  for (const code of ['ai_unavailable', 'ai_empty_response', 'ai_error', 'ai_timeout']) {
    const msg = workerErrorMessage({ ok: false, error: code });
    assert.ok(msg.includes('Workers AI'), code);
  }
});

test('workerErrorMessage maps kv_not_configured to the KV setup fix', () => {
  const msg = workerErrorMessage({ ok: false, error: 'kv_not_configured' });
  assert.ok(msg.includes('KV'));
  assert.ok(msg.includes('wrangler.toml'));
});

test('workerErrorMessage shows unknown codes raw instead of a bare generic error', () => {
  const msg = workerErrorMessage({ ok: false, error: 'weird_code_123' });
  assert.ok(msg.includes('weird_code_123'));
  assert.notEqual(msg, 'خطایی رخ داد.');
  const http = workerErrorMessage({ ok: false, error: 'worker_http_502' });
  assert.ok(http.includes('502'));
});
