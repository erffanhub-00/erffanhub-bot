import test from "node:test";
import assert from "node:assert/strict";
import { publishDraft, buildCaption, buildPostText } from "../src/lib/publish.js";

const ENV = { BOT_TOKEN: "test-token" };

function telegramStub({ ok = true, messageId = 42, description = "Bad Request: chat not found" } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      async json() {
        return ok
          ? { ok: true, result: { message_id: messageId } }
          : { ok: false, error_code: 400, description };
      },
    };
  };
  return { calls, fetchImpl };
}

test("publishDraft: sendMessage without media, with inline button", async () => {
  const { calls, fetchImpl } = telegramStub();
  const result = await publishDraft(
    ENV,
    { title: "Title", body: "Body text", button_text: "مشاهده خبر", button_url: "https://example.com/news" },
    "@channel",
    fetchImpl,
  );
  assert.deepEqual(result, { ok: true, message_id: 42 });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/sendMessage"), calls[0].url);
  assert.equal(calls[0].body.chat_id, "@channel");
  assert.equal(calls[0].body.text, "Title\n\nBody text");
  assert.deepEqual(calls[0].body.reply_markup, {
    inline_keyboard: [[{ text: "مشاهده خبر", url: "https://example.com/news" }]],
  });
});

test("publishDraft: sendPhoto with media_url and caption, no button when not set", async () => {
  const { calls, fetchImpl } = telegramStub({ messageId: 7 });
  const result = await publishDraft(
    ENV,
    { title: "Title", body: "Body", media_url: "https://i.ytimg.com/vi/x/hqdefault.jpg" },
    "@channel",
    fetchImpl,
  );
  assert.deepEqual(result, { ok: true, message_id: 7 });
  assert.ok(calls[0].url.endsWith("/sendPhoto"));
  assert.equal(calls[0].body.photo, "https://i.ytimg.com/vi/x/hqdefault.jpg");
  assert.equal(calls[0].body.caption, "Title\n\nBody");
  assert.equal(calls[0].body.reply_markup, undefined);
});

test("buildCaption: truncates a long caption to 1024 chars", () => {
  const draft = { title: "T", body: "x".repeat(2000) };
  const caption = buildCaption(draft);
  assert.ok(caption.length <= 1024, `caption length ${caption.length}`);
  assert.ok(caption.endsWith("..."));
  assert.equal(buildPostText(draft).length, 2003);
});

test("publishDraft: a clear Telegram rejection is returned, never treated as success", async () => {
  const { fetchImpl } = telegramStub({ ok: false, description: "Bad Request: chat not found" });
  const result = await publishDraft(ENV, { title: "T", body: "B" }, "@channel", fetchImpl);
  assert.deepEqual(result, { ok: false, error: "Bad Request: chat not found" });
});

test("publishDraft: a network failure throws (unknown outcome, must not be retried blindly)", async () => {
  const throwingFetch = async () => {
    throw new Error("network down");
  };
  await assert.rejects(publishDraft(ENV, { title: "T", body: "B" }, "@channel", throwingFetch), /network down/);
});

test("publishDraft: rejects empty drafts and missing channel", async () => {
  const { fetchImpl } = telegramStub();
  assert.deepEqual(await publishDraft(ENV, { title: "", body: "" }, "@channel", fetchImpl), {
    ok: false,
    error: "empty_draft",
  });
  assert.deepEqual(await publishDraft(ENV, { title: "T", body: "B" }, "", fetchImpl), {
    ok: false,
    error: "missing_channel_id",
  });
});
