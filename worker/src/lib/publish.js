// Publishing to Telegram. This is the single publish path: the /publish
// route and the Cron trigger both call publishDraft.
// A clear Telegram rejection (API ok:false) is returned as {ok:false}.
// A network failure or an unparsable response is thrown: the outcome is
// unknown, so the caller must never treat it as success or retry blindly.

export const TELEGRAM_CAPTION_MAX = 1024;

export function buildPostText(draft) {
  const title = (draft?.title ?? "").trim();
  const body = (draft?.body ?? "").trim();
  if (title && body) return `${title}\n\n${body}`;
  return title || body;
}

export function buildCaption(draft) {
  const text = buildPostText(draft);
  if (text.length <= TELEGRAM_CAPTION_MAX) return text;
  return text.slice(0, TELEGRAM_CAPTION_MAX - 3).trimEnd() + "...";
}

export function buildReplyMarkup(draft) {
  if (draft?.button_text && draft?.button_url) {
    return { inline_keyboard: [[{ text: draft.button_text, url: draft.button_url }]] };
  }
  return undefined;
}

async function callTelegram(env, method, payload, fetchImpl) {
  if (!env?.BOT_TOKEN) throw new Error("bot_token_missing");
  const response = await fetchImpl(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("telegram_unparsable_response");
  }
  if (!data || data.ok !== true) {
    return { ok: false, error: data?.description || data?.error || "telegram_error" };
  }
  return { ok: true, message_id: data.result?.message_id ?? null };
}

export async function publishDraft(env, draft, channelId, fetchImpl = fetch) {
  if (!draft || typeof draft !== "object") return { ok: false, error: "invalid_draft" };
  if (!channelId) return { ok: false, error: "missing_channel_id" };
  const text = buildPostText(draft);
  if (!text) return { ok: false, error: "empty_draft" };
  const replyMarkup = buildReplyMarkup(draft);
  if (draft.media_url) {
    const payload = {
      chat_id: channelId,
      photo: draft.media_url,
      caption: buildCaption(draft),
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    return callTelegram(env, "sendPhoto", payload, fetchImpl);
  }
  const payload = { chat_id: channelId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return callTelegram(env, "sendMessage", payload, fetchImpl);
}

export async function notifyOwner(env, message, fetchImpl = fetch) {
  if (!env?.OWNER_TELEGRAM_ID || !env?.BOT_TOKEN) {
    console.log("notifyOwner skipped: OWNER_TELEGRAM_ID or BOT_TOKEN not set");
    return { ok: false, error: "owner_not_configured" };
  }
  try {
    return await callTelegram(
      env,
      "sendMessage",
      { chat_id: env.OWNER_TELEGRAM_ID, text: message },
      fetchImpl,
    );
  } catch (err) {
    console.log("notifyOwner failed:", err?.message ?? err);
    return { ok: false, error: err?.message ?? "notify_failed" };
  }
}
