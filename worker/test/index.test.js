import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { SYSTEM_PROMPT } from "../src/lib/ai.js";

const SECRET = "test-shared-secret";

function headers(extra = {}) {
  return {
    "x-erffan-secret": SECRET,
    "x-timestamp": String(Math.floor(Date.now() / 1000)),
    ...extra,
  };
}

function makeKv() {
  const store = new Map();
  return {
    store,
    async put(key, value) {
      store.set(key, value);
    },
    async get(key) {
      return store.get(key) ?? null;
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix }) {
      return {
        keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
        cursor: undefined,
      };
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    SHARED_SECRET: SECRET,
    BOT_TOKEN: "test-token",
    OWNER_TELEGRAM_ID: "999",
    SCHEDULED_KV: makeKv(),
    AI: {
      async run(model, { messages }) {
        assert.equal(model, "@cf/meta/llama-3.1-8b-instruct");
        return { response: "عنوان تست\n\nخط اول پست.\nخط دوم پست." };
      },
    },
    ...overrides,
  };
}

async function call(env, path, { method = "POST", body = undefined, headers: extraHeaders = {} } = {}) {
  const request = new Request(`https://worker.test${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers(), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await worker.fetch(request, env);
  return { status: response.status, data: await response.json() };
}

test("auth: missing secret or stale timestamp returns 401 unauthorized", async () => {
  const env = makeEnv();
  const noSecret = new Request("https://worker.test/ai", {
    method: "POST",
    headers: { "x-timestamp": String(Math.floor(Date.now() / 1000)) },
    body: JSON.stringify({ task: "write_post", title: "T" }),
  });
  const r1 = await worker.fetch(noSecret, env);
  assert.equal(r1.status, 401);
  assert.deepEqual(await r1.json(), { ok: false, error: "unauthorized" });

  const stale = await call(env, "/ai", {
    body: { task: "write_post", title: "T" },
    headers: { "x-timestamp": String(Math.floor(Date.now() / 1000) - 3600) },
  });
  assert.equal(stale.status, 401);
  assert.deepEqual(stale.data, { ok: false, error: "unauthorized" });
});

test("auth: unknown route returns 404", async () => {
  const env = makeEnv();
  const { status, data } = await call(env, "/nope", { body: {} });
  assert.equal(status, 404);
  assert.deepEqual(data, { ok: false, error: "not_found" });
});

test("POST /ai: returns the model text; system prompt forbids inventing facts", async () => {
  assert.ok(SYSTEM_PROMPT.includes("نساز"));
  const env = makeEnv();
  const { status, data } = await call(env, "/ai", {
    body: { task: "write_post", title: "خبر تست", text: "متن خبر", source_url: "https://example.com/x" },
  });
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.ok(data.text.includes("عنوان تست"));
});

test("POST /ai: invalid task and missing input return 400; AI failure returns ok:false, never crashes", async () => {
  const env = makeEnv();
  const bad = await call(env, "/ai", { body: { task: "chat", text: "hi" } });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.ok, false);
  const empty = await call(env, "/ai", { body: { task: "rewrite" } });
  assert.equal(empty.status, 400);

  const failing = makeEnv({
    AI: {
      async run() {
        throw new Error("model overloaded");
      },
    },
  });
  const failed = await call(failing, "/ai", { body: { task: "shorten", text: "some text" } });
  assert.equal(failed.status, 502);
  assert.deepEqual(failed.data, { ok: false, error: "model overloaded" });
});

test("POST /news/fetch: one bad feed does not fail the whole request", async () => {
  const env = makeEnv();
  const { status, data } = await call(env, "/news/fetch", {
    body: { feeds: ["http://example.com/feed", "https://localhost/feed"] },
  });
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.deepEqual(data.items, []);
  assert.equal(data.errors.length, 2);
  assert.deepEqual(data.errors[0], { feed: "http://example.com/feed", error: "https_only" });
});

test("POST /schedule: stores a future post, rejects a past one, cancel deletes it", async () => {
  const env = makeEnv();
  const draft = { id: "d1", title: "T", body: "B" };
  const future = await call(env, "/schedule", {
    body: { draft, channel_id: "@channel", publish_at: Date.now() + 3600_000 },
  });
  assert.deepEqual(future.data, { ok: true });
  const stored = JSON.parse(await env.SCHEDULED_KV.get("scheduled:d1"));
  assert.equal(stored.channel_id, "@channel");
  assert.equal(stored.draft.title, "T");

  const past = await call(env, "/schedule", {
    body: { draft, channel_id: "@channel", publish_at: Date.now() - 1000 },
  });
  assert.equal(past.status, 400);
  assert.equal(past.data.error, "publish_at_must_be_in_future");

  const noId = await call(env, "/schedule", {
    body: { draft: { title: "T" }, channel_id: "@channel", publish_at: Date.now() + 1000 },
  });
  assert.equal(noId.status, 400);

  const cancelled = await call(env, "/schedule/cancel", { body: { draft_id: "d1" } });
  assert.deepEqual(cancelled.data, { ok: true });
  assert.equal(await env.SCHEDULED_KV.get("scheduled:d1"), null);
});

test("GET /link/preview: non-YouTube URL returns 400 only_youtube", async () => {
  const env = makeEnv();
  const request = new Request("https://worker.test/link/preview?url=https%3A%2F%2Fexample.com%2Fvideo", {
    method: "GET",
    headers: headers(),
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "only_youtube" });
});

test("GET /link/preview: YouTube URL returns oEmbed title, author and thumbnail, no description", async () => {
  const env = makeEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(String(url).startsWith("https://www.youtube.com/oembed?url="));
    return {
      ok: true,
      async json() {
        return {
          title: "Sample video",
          author_name: "Sample channel",
          thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        };
      },
    };
  };
  try {
    const request = new Request(
      "https://worker.test/link/preview?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ",
      { method: "GET", headers: headers() },
    );
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data, {
      ok: true,
      kind: "youtube",
      title: "Sample video",
      author_name: "Sample channel",
      thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
    assert.ok(!("description" in data));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cron scheduled(): publishes due posts and deletes the key only after success", async () => {
  const env = makeEnv();
  const draft = { id: "due1", title: "Due post", body: "Body" };
  await env.SCHEDULED_KV.put(
    "scheduled:due1",
    JSON.stringify({ draft, channel_id: "@channel", publish_at: Date.now() - 1000 }),
  );
  await env.SCHEDULED_KV.put(
    "scheduled:later1",
    JSON.stringify({
      draft: { id: "later1", title: "Later", body: "B" },
      channel_id: "@channel",
      publish_at: Date.now() + 3600_000,
    }),
  );
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { async json() { return { ok: true, result: { message_id: 55 } }; } };
  };
  try {
    await worker.scheduled({}, env, {});
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.text, "Due post\n\nBody");
  assert.equal(await env.SCHEDULED_KV.get("scheduled:due1"), null);
  assert.notEqual(await env.SCHEDULED_KV.get("scheduled:later1"), null);
});

test("Cron scheduled(): clear Telegram rejection moves the post to failed: and notifies the owner", async () => {
  const env = makeEnv();
  await env.SCHEDULED_KV.put(
    "scheduled:bad1",
    JSON.stringify({
      draft: { id: "bad1", title: "Bad post", body: "B" },
      channel_id: "@channel",
      publish_at: Date.now() - 1000,
    }),
  );
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(JSON.parse(options.body));
    return { async json() { return { ok: false, description: "Bad Request: chat not found" }; } };
  };
  try {
    await worker.scheduled({}, env, {});
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(await env.SCHEDULED_KV.get("scheduled:bad1"), null);
  const failed = JSON.parse(await env.SCHEDULED_KV.get("failed:bad1"));
  assert.equal(failed.error, "Bad Request: chat not found");
  assert.ok(calls.some((b) => typeof b.text === "string" && b.text.includes("ناموفق")));
});

test("Cron scheduled(): uncertain outcome moves the post to needs_review: and never retries", async () => {
  const env = makeEnv();
  await env.SCHEDULED_KV.put(
    "scheduled:unc1",
    JSON.stringify({
      draft: { id: "unc1", title: "Uncertain post", body: "B" },
      channel_id: "@channel",
      publish_at: Date.now() - 1000,
    }),
  );
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    // The publish attempt itself throws; the owner notification succeeds.
    if (body.chat_id === "@channel") throw new Error("network down");
    return { async json() { return { ok: true, result: { message_id: 1 } }; } };
  };
  try {
    await worker.scheduled({}, env, {});
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 2, "exactly one publish attempt plus one owner notification, no retry");
  assert.equal(await env.SCHEDULED_KV.get("scheduled:unc1"), null);
  const review = JSON.parse(await env.SCHEDULED_KV.get("needs_review:unc1"));
  assert.equal(review.error, "network down");
  assert.equal(await env.SCHEDULED_KV.get("failed:unc1"), null);
});
