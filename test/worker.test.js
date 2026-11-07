// The cleanup Worker calls the bot's /api/cleanup endpoint with the
// owner's signed Telegram init data, exactly the way the Mini App SDK
// does. This test proves the signature matches Telegram's official
// validation algorithm (HMAC-SHA256 over the sorted data-check-string
// with key SHA256(bot_token)) — if the signing ever breaks, the
// platform rejects the call with 401 and the timer silently stops
// working, so this is the one thing worth pinning down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

const worker = await import('../cleanup-worker/worker.js');

test('worker calls /api/cleanup with a validly signed TMA initData', async () => {
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { status: 200, json: async () => ({ deleted: 3, at: 1 }) };
  };
  const env = {
    APP_URL: 'https://app8692409054.tgcloud.ai',
    OWNER_ID: '123456789',
    BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
  };
  const res = await worker.default.fetch(new Request('https://worker.example/'), env);
  const out = JSON.parse(await res.text());
  assert.equal(out.status, 200);
  assert.equal(out.body.deleted, 3);
  assert.equal(captured.url, 'https://app8692409054.tgcloud.ai/api/cleanup');
  assert.equal(captured.opts.method, 'POST');
  assert.equal(captured.opts.body, '{}');
  const auth = captured.opts.headers.Authorization;
  assert.ok(auth.startsWith('TMA '));
  const initData = Buffer.from(auth.slice(4), 'base64').toString('utf8');
  const params = new URLSearchParams(initData);
  const user = JSON.parse(params.get('user'));
  assert.equal(user.id, 123456789);
  // Independent Telegram validation (core.telegram.org/bots/webapps):
  const pairs = [];
  for (const [k, v] of params.entries()) if (k !== 'hash') pairs.push([k, v]);
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const checkString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = createHash('sha256').update(env.BOT_TOKEN).digest();
  const expected = createHmac('sha256', secretKey).update(checkString).digest('hex');
  assert.equal(params.get('hash'), expected);
  // auth_date is fresh (within the last minute).
  assert.ok(Math.abs(Date.now() / 1000 - Number(params.get('auth_date'))) < 60);
});
