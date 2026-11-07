import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const SECRET = "test-shared-secret";

function headers() {
  return {
    "x-erffan-secret": SECRET,
    "x-timestamp": String(Math.floor(Date.now() / 1000)),
  };
}

function makeEnv(overrides = {}) {
  return {
    SHARED_SECRET: SECRET,
    SCHEDULED_KV: {},
    AI: { async run() { return { response: "ok" }; } },
    ...overrides,
  };
}

async function call(env, path) {
  const request = new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers() },
    body: JSON.stringify({}),
  });
  const response = await worker.fetch(request, env);
  return { status: response.status, data: await response.json() };
}

test("POST /health: reports ai and kv bindings when configured", async () => {
  const env = makeEnv();
  const { status, data } = await call(env, "/health");
  assert.equal(status, 200);
  assert.deepEqual(data, { ok: true, ai: true, kv: true });
});

test("POST /health: reports missing bindings as false", async () => {
  const env = makeEnv({ AI: undefined, SCHEDULED_KV: undefined });
  const { status, data } = await call(env, "/health");
  assert.equal(status, 200);
  assert.deepEqual(data, { ok: true, ai: false, kv: false });
});

test("POST /health: requires the shared secret like every other route", async () => {
  const env = makeEnv();
  const request = new Request("https://worker.test/health", {
    method: "POST",
    headers: { "x-timestamp": String(Math.floor(Date.now() / 1000)) },
    body: JSON.stringify({}),
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" });
});
