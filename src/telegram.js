/**
 * Minimal Telegram Bot API client. The bot token is never logged.
 */

const TELEGRAM_API = "https://api.telegram.org";

function telegramUrl(env, method) {
  return `${TELEGRAM_API}/bot${env.BOT_TOKEN}/${method}`;
}

async function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Call a Bot API method. Returns the `result` field, or null on any failure.
 */
export async function callTelegram(method, payload, env) {
  let response;
  try {
    response = await postJson(telegramUrl(env, method), payload);
  } catch (err) {
    console.error(`Network error on ${method}: ${err.message}`);
    return null;
  }

  if (!response.ok) {
    console.error(`Telegram HTTP error on ${method}: ${response.status}`);
    return null;
  }

  let body;
  try {
    body = await response.json();
  } catch {
    console.error(`Invalid JSON from Telegram on ${method}`);
    return null;
  }

  if (!body.ok) {
    console.error(`Telegram API rejected ${method}: ${body.description || "unknown error"}`);
    return null;
  }

  return body.result;
}

/**
 * Proxy a Bot API call and return Telegram's response unchanged (status and
 * body). Used by the admin endpoints so the caller sees the real result.
 */
export async function proxyTelegram(method, payload, env) {
  let response;
  try {
    response = await postJson(telegramUrl(env, method), payload);
  } catch (err) {
    console.error(`Network error on ${method}: ${err.message}`);
    return new Response("Bad Gateway", { status: 502 });
  }
  return new Response(await response.text(), { status: response.status });
}

export function sendMessage(chatId, text, env, extra = {}) {
  return callTelegram("sendMessage", { chat_id: chatId, text, ...extra }, env);
}

export function editMessageText(chatId, messageId, text, env, extra = {}) {
  return callTelegram(
    "editMessageText",
    { chat_id: chatId, message_id: messageId, text, ...extra },
    env
  );
}

export function answerCallbackQuery(callbackQueryId, env, extra = {}) {
  return callTelegram(
    "answerCallbackQuery",
    { callback_query_id: callbackQueryId, ...extra },
    env
  );
}
