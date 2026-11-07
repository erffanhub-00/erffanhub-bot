// ErffanHub Worker: RSS fetch, AI post writing, YouTube preview,
// publishing to the Telegram channel, and Cron publishing of scheduled posts.
// Plain JavaScript, no dependencies. All routes except the Cron trigger
// require X-Erffan-Secret and a fresh X-Timestamp header.

import { validateUrl } from "./lib/validate.js";
import { parseRss, fetchFeed, dedupeItems } from "./lib/rss.js";
import { writePost, classifyItems } from "./lib/ai.js";
import { publishDraft, notifyOwner } from "./lib/publish.js";
import { normalizeYouTubeUrl, parseOembed } from "./lib/youtube.js";
import { tehranNow, isDue } from "./lib/time.js";

const TIMESTAMP_WINDOW_SECONDS = 300;
const AI_TASKS = new Set(["write_post", "rewrite", "shorten", "formal"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isAuthorized(request, env) {
  const secret = request.headers.get("x-erffan-secret");
  if (!env?.SHARED_SECRET || !secret || secret !== env.SHARED_SECRET) return false;
  const timestamp = Number(request.headers.get("x-timestamp"));
  if (!Number.isFinite(timestamp)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - timestamp) <= TIMESTAMP_WINDOW_SECONDS;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleHealth(request, env) {
  return json({ ok: true, ai: !!env?.AI, kv: !!env?.SCHEDULED_KV });
}

async function handleAi(request, env) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400);
  const task = body.task;
  if (!AI_TASKS.has(task)) return json({ ok: false, error: "invalid_task" }, 400);
  if (!body.title && !body.text) return json({ ok: false, error: "title_or_text_required" }, 400);
  try {
    const text = await writePost(env, {
      task,
      title: body.title ?? "",
      text: body.text ?? "",
      source_url: body.source_url ?? "",
    });
    return json({ ok: true, text });
  } catch (err) {
    console.log("AI error:", err?.message ?? err);
    return json({ ok: false, error: err?.message ?? "ai_error" }, 502);
  }
}

const CLASSIFY_MAX_ITEMS = 30;

// Classify a batch of news items with one AI call. Never fails the
// fetch: the bot treats any failure here as 'سایر' for every item.
async function handleClassify(request, env) {
  const body = await readJson(request);
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return json({ ok: false, error: "items_required" }, 400);
  }
  const items = body.items.slice(0, CLASSIFY_MAX_ITEMS).map((it) => ({
    id: it?.id ?? null,
    title: String(it?.title ?? ""),
    text: String(it?.text ?? ""),
  }));
  try {
    const categories = await classifyItems(env, items);
    return json({ ok: true, categories });
  } catch (err) {
    console.log("Classify error:", err?.message ?? err);
    return json({ ok: false, error: err?.message ?? "ai_error" }, 502);
  }
}

async function handleNewsFetch(request, env) {
  const body = await readJson(request);
  if (!body || !Array.isArray(body.feeds)) {
    return json({ ok: false, error: "feeds_required" }, 400);
  }
  const items = [];
  const errors = [];
  for (const feed of body.feeds) {
    if (typeof feed !== "string") {
      errors.push({ feed: String(feed), error: "invalid_url" });
      continue;
    }
    const check = validateUrl(feed);
    if (!check.ok) {
      errors.push({ feed, error: check.reason ?? "invalid_url" });
      continue;
    }
    try {
      const xml = await fetchFeed(feed);
      items.push(...parseRss(xml));
    } catch (err) {
      console.log("Feed failed:", feed, err?.message ?? err);
      errors.push({ feed, error: err?.message ?? "fetch_failed" });
    }
  }
  return json({ ok: true, items: dedupeItems(items), errors });
}

async function handleLinkPreview(request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return json({ ok: false, error: "url_required" }, 400);
  const canonical = normalizeYouTubeUrl(url);
  if (!canonical) return json({ ok: false, error: "only_youtube" }, 400);
  // Note: YouTube oEmbed returns NO description. The description of a
  // YouTube draft stays empty for the owner to fill in.
  let response;
  try {
    response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`,
      { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } },
    );
  } catch (err) {
    console.log("oEmbed fetch failed:", err?.message ?? err);
    return json({ ok: false, error: "oembed_failed" }, 502);
  }
  if (!response.ok) return json({ ok: false, error: "oembed_failed" }, 502);
  let payload;
  try {
    payload = await response.json();
  } catch {
    return json({ ok: false, error: "oembed_failed" }, 502);
  }
  const preview = parseOembed(payload);
  if (!preview) return json({ ok: false, error: "oembed_failed" }, 502);
  return json({ ok: true, ...preview });
}

async function handlePublish(request, env) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400);
  if (!body.draft || !body.channel_id) {
    return json({ ok: false, error: "draft_and_channel_id_required" }, 400);
  }
  let result;
  try {
    result = await publishDraft(env, body.draft, body.channel_id);
  } catch (err) {
    console.log("Publish failed (unknown outcome):", err?.message ?? err);
    return json({ ok: false, error: err?.message ?? "publish_failed" }, 502);
  }
  if (!result.ok) return json({ ok: false, error: result.error }, 502);
  return json({ ok: true, message_id: result.message_id });
}

function scheduledKey(draftId) {
  return `scheduled:${draftId}`;
}

async function handleSchedule(request, env) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400);
  const { draft, channel_id, publish_at } = body;
  if (!draft?.id || !channel_id || !Number.isFinite(Number(publish_at))) {
    return json({ ok: false, error: "draft_id_channel_id_and_publish_at_required" }, 400);
  }
  if (Number(publish_at) <= Date.now()) {
    return json({ ok: false, error: "publish_at_must_be_in_future" }, 400);
  }
  if (!env?.SCHEDULED_KV) return json({ ok: false, error: "kv_not_configured" }, 500);
  await env.SCHEDULED_KV.put(
    scheduledKey(draft.id),
    JSON.stringify({ draft, channel_id, publish_at: Number(publish_at) }),
  );
  return json({ ok: true });
}

async function handleScheduleCancel(request, env) {
  const body = await readJson(request);
  if (!body || !body.draft_id) return json({ ok: false, error: "draft_id_required" }, 400);
  if (!env?.SCHEDULED_KV) return json({ ok: false, error: "kv_not_configured" }, 500);
  await env.SCHEDULED_KV.delete(scheduledKey(body.draft_id));
  return json({ ok: true });
}

async function runScheduled(env) {
  const nowMs = Date.now();
  console.log(`Cron run at Tehran ${tehranNow(new Date(nowMs))} (${nowMs})`);
  if (!env?.SCHEDULED_KV) {
    console.log("Cron skipped: SCHEDULED_KV not configured");
    return;
  }
  let cursor;
  do {
    const page = await env.SCHEDULED_KV.list({ prefix: "scheduled:", cursor });
    cursor = page.cursor && page.list_complete === false ? page.cursor : undefined;
    for (const { name } of page.keys ?? []) {
      const draftId = name.slice("scheduled:".length);
      let raw;
      try {
        raw = await env.SCHEDULED_KV.get(name);
      } catch (err) {
        console.log(`Cron: could not read ${name}:`, err?.message ?? err);
        continue;
      }
      if (!raw) continue;
      let stored;
      try {
        stored = JSON.parse(raw);
      } catch {
        console.log(`Cron: invalid JSON in ${name}, deleting`);
        await env.SCHEDULED_KV.delete(name);
        continue;
      }
      if (!isDue(stored.publish_at, nowMs)) continue;
      console.log(`Cron: publishing scheduled draft ${draftId}`);
      const attemptedAt = Date.now();
      let result;
      try {
        result = await publishDraft(env, stored.draft, stored.channel_id);
      } catch (err) {
        // Unknown outcome: the post may or may not have been published.
        // Never auto-retry. Move it aside for the owner to review.
        const message = err?.message ?? "publish_failed";
        console.log(`Cron: uncertain outcome for ${draftId}: ${message}`);
        await env.SCHEDULED_KV.put(
          `needs_review:${draftId}`,
          JSON.stringify({ ...stored, error: message, attempted_at: attemptedAt }),
        );
        await env.SCHEDULED_KV.delete(name);
        await notifyOwner(
          env,
          `پست زمان‌بندی‌شده «${stored.draft?.title ?? draftId}» وضعیت نامشخصی دارد؛ ممکن است منتشر شده باشد. لطفاً کانال را بررسی کنید.`,
        );
        continue;
      }
      if (result.ok) {
        console.log(`Cron: published ${draftId}, message ${result.message_id}`);
        await env.SCHEDULED_KV.delete(name);
        continue;
      }
      // Telegram clearly rejected it: it was not published.
      console.log(`Cron: Telegram rejected ${draftId}: ${result.error}`);
      await env.SCHEDULED_KV.put(
        `failed:${draftId}`,
        JSON.stringify({ ...stored, error: result.error, attempted_at: attemptedAt }),
      );
      await env.SCHEDULED_KV.delete(name);
      await notifyOwner(
        env,
        `انتشار پست زمان‌بندی‌شده «${stored.draft?.title ?? draftId}» ناموفق بود: ${result.error}`,
      );
    }
  } while (cursor);
  console.log("Cron run finished");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (!isAuthorized(request, env)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    try {
      if (request.method === "POST" && path === "/health") return handleHealth(request, env);
      if (request.method === "POST" && path === "/ai") return handleAi(request, env);
      if (request.method === "POST" && path === "/ai/classify") return handleClassify(request, env);
      if (request.method === "POST" && path === "/news/fetch") return handleNewsFetch(request, env);
      if (request.method === "GET" && path === "/link/preview") return handleLinkPreview(request);
      if (request.method === "POST" && path === "/publish") return handlePublish(request, env);
      if (request.method === "POST" && path === "/schedule") return handleSchedule(request, env);
      if (request.method === "POST" && path === "/schedule/cancel") return handleScheduleCancel(request, env);
      return json({ ok: false, error: "not_found" }, 404);
    } catch (err) {
      console.log("Request failed:", err?.message ?? err);
      return json({ ok: false, error: "internal_error" }, 500);
    }
  },

  // Cron trigger is exempt from the shared-secret auth above.
  async scheduled(event, env, ctx) {
    try {
      await runScheduled(env);
    } catch (err) {
      console.log("Cron failed:", err?.message ?? err);
    }
  },
};
