import {
  buildMainMenu,
  buildCategoryMenu,
  buildAboutMenu,
  getMainMenuText,
  getCategoryText,
  getLinksText,
} from "./menu.js";

import { owner, getAboutText, getHelpText } from "./about.js";
import { handleInlineQuery } from "./inline.js";

/**
 * Call the Telegram Bot API. Never logs the token or payload.
 */
async function callTelegram(method, payload, env) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
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
    console.error(
      `Telegram API rejected ${method}: ${body.description || "unknown error"}`
    );
    return null;
  }

  return body.result;
}

/**
 * Route incoming Telegram updates.
 */
export async function handleUpdate(update, env) {
  // Save files from the dedicated storage group.
  if (
    update.message?.document ||
    update.message?.video ||
    update.message?.audio
  ) {
    await handleFileMessage(update.message, env);
    return;
  }

  // Inline query from any chat.
  if (update.inline_query) {
    await handleInlineQuery(update.inline_query, env);
    return;
  }

  if (update.message?.text) {
    await handleMessage(update.message, env);
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
  }
}

/**
 * Save a file's metadata to D1.
 * Only accepts files from the configured storage group.
 */
async function handleFileMessage(message, env) {
  if (!env.STORAGE_GROUP_ID) return;
  if (String(message.chat.id) !== String(env.STORAGE_GROUP_ID)) return;

  const file = message.document || message.video || message.audio;
  if (!file) return;

  const fileName = file.file_name || `file_${Date.now()}`;
  const fileId = file.file_id;

  const ext = fileName.includes(".")
    ? fileName.split(".").pop().toLowerCase()
    : "unknown";

  let category = null;
  if (message.caption) {
    const match = message.caption.match(/#(\S+)/);
    if (match) category = match[1].toLowerCase();
  }

  try {
    await env.DB.prepare(
      "INSERT INTO files (file_id, file_name, file_extension, category) VALUES (?, ?, ?, ?)"
    )
      .bind(fileId, fileName, ext, category)
      .run();

    await callTelegram(
      "sendMessage",
      {
        chat_id: message.chat.id,
        text: `✅ Saved: ${fileName}`,
        reply_to_message_id: message.message_id,
      },
      env
    );
  } catch (err) {
    console.error("Failed to save file:", err.message);
  }
}

/**
 * Handle text messages and commands.
 */
async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === "/start") {
    await callTelegram(
      "sendMessage",
      {
        chat_id: chatId,
        text: getMainMenuText(),
        parse_mode: "Markdown",
        reply_markup: buildMainMenu(),
      },
      env
    );
    return;
  }

  if (text === "/help") {
    await callTelegram(
      "sendMessage",
      {
        chat_id: chatId,
        text: getHelpText(),
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Back", callback_data: "back:main" }]],
        },
      },
      env
    );
    return;
  }

  if (text === "/about") {
    await callTelegram(
      "sendMessage",
      {
        chat_id: chatId,
        text: getAboutText(),
        parse_mode: "Markdown",
        reply_markup: buildAboutMenu(owner.links),
      },
      env
    );
    return;
  }

  if (text === "/links") {
    await callTelegram(
      "sendMessage",
      {
        chat_id: chatId,
        text: getLinksText(),
        parse_mode: "Markdown",
        reply_markup: buildAboutMenu(owner.links),
      },
      env
    );
    return;
  }

  await callTelegram(
    "sendMessage",
    { chat_id: chatId, text: "Invalid command. Use /start." },
    env
  );
}

/**
 * Handle inline keyboard button presses.
 */
async function handleCallbackQuery(query, env) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data || "";

  await callTelegram(
    "answerCallbackQuery",
    { callback_query_id: query.id },
    env
  );

  if (data.startsWith("cat:")) {
    const categoryId = data.slice(4);
    await callTelegram(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text: getCategoryText(categoryId),
        parse_mode: "Markdown",
        reply_markup: buildCategoryMenu(categoryId),
      },
      env
    );
    return;
  }

  if (data === "about") {
    await callTelegram(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text: getAboutText(),
        parse_mode: "Markdown",
        reply_markup: buildAboutMenu(owner.links),
      },
      env
    );
    return;
  }

  if (data === "help") {
    await callTelegram(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text: getHelpText(),
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Back", callback_data: "back:main" }]],
        },
      },
      env
    );
    return;
  }

  if (data === "links") {
    await callTelegram(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text: getLinksText(),
        parse_mode: "Markdown",
        reply_markup: buildAboutMenu(owner.links),
      },
      env
    );
    return;
  }

  if (data === "back:main") {
    await callTelegram(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text: getMainMenuText(),
        parse_mode: "Markdown",
        reply_markup: buildMainMenu(),
      },
      env
    );
  }
}