import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { makeEnv, stubFetch, telegramCalls } from "./helpers.js";

const SECRET = "test-secret";

function request(path, { method = "GET", secret = null, body = null } = {}) {
  const headers = {};
  if (secret) headers["X-Telegram-Bot-Api-Secret-Token"] = secret;
  return new Request(`https://worker${path}`, { method, headers, body });
}

async function call(path, env, options) {
  const waited = [];
  const ctx = { waitUntil: (p) => waited.push(p) };
  const res = await worker.fetch(request(path, options), env, ctx);
  await Promise.all(waited);
  return res;
}

test("root returns the bot name", async () => {
  const res = await call("/", makeEnv());
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ErffanHub Toolbox");
});

test("webhook: no secret configured means 403", async () => {
  const env = makeEnv({ WEBHOOK_SECRET: "" });
  const res = await call("/webhook", env, { method: "POST", secret: SECRET, body: "{}" });
  assert.equal(res.status, 403);
});

test("webhook: wrong secret means 403, right secret means 200", async () => {
  const env = makeEnv();
  const wrong = await call("/webhook", env, { method: "POST", secret: "nope", body: "{}" });
  assert.equal(wrong.status, 403);
  const missing = await call("/webhook", env, { method: "POST", body: "{}" });
  assert.equal(missing.status, 403);
  const ok = await call("/webhook", env, { method: "POST", secret: SECRET, body: "{}" });
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "OK");
});

test("webhook: malformed JSON still returns 200 so Telegram does not retry", async () => {
  const res = await call("/webhook", makeEnv(), { method: "POST", secret: SECRET, body: "{bad" });
  assert.equal(res.status, 200);
});

test("webhook: a real update is handled, not just accepted", async () => {
  const { calls, restore } = stubFetch();
  try {
    const update = { message: { message_id: 1, chat: { id: 1, type: "private" }, from: { id: 123 }, text: "/start" } };
    const res = await call("/webhook", makeEnv(), { method: "POST", secret: SECRET, body: JSON.stringify(update) });
    assert.equal(res.status, 200);
    assert.equal(telegramCalls(calls, "sendMessage").length, 1);
  } finally {
    restore();
  }
});

test("setup-commands: secret required, then Telegram's real response is proxied", async () => {
  const { calls, restore } = stubFetch(() => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: true }),
    text: async () => '{"ok":true,"result":true}',
  }));
  try {
    const denied = await call("/setup-commands", makeEnv(), { secret: "wrong" });
    assert.equal(denied.status, 403);
    assert.equal(calls.length, 0);

    const res = await call("/setup-commands", makeEnv(), { secret: SECRET });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '{"ok":true,"result":true}');
    const set = telegramCalls(calls, "setMyCommands");
    assert.equal(set.length, 1);
    assert.deepEqual(
      set[0].payload.commands.map((c) => c.command),
      ["start", "help", "about", "links"]
    );
  } finally {
    restore();
  }
});

test("get-commands: secret required, Telegram errors keep their status", async () => {
  const { calls, restore } = stubFetch(() => ({
    ok: false,
    status: 500,
    json: async () => ({ ok: false }),
    text: async () => '{"ok":false}',
  }));
  try {
    const res = await call("/get-commands", makeEnv(), { secret: SECRET });
    assert.equal(res.status, 500);
    assert.equal(telegramCalls(calls, "getMyCommands").length, 1);
  } finally {
    restore();
  }
});
