import {
  buildMainMenu,
  buildCategoryMenu,
  buildAboutMenu,
  buildReplyKeyboard,
  getMainMenuText,
  getCategoryText,
  getLinksText,
} from "./menu.js";

import { owner, getAboutText, getHelpText } from "./about.js";

/**
 * Send a request to the Telegram Bot API and inspect the JSON body.
 * @param {string} method
 * @param {object} payload
 * @param {object} env
 * @returns {Promise<object|null>}
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
 * Check whether the given Telegram user is the bot owner.
 * @param {number} userId
 * @param {object} env
 * @returns {boolean}
 */
function isOwner(userId, env) {
  return String(userId) === String(env.OWNER_TELEGRAM_ID);
}

/**
 * Entry point for every Telegram update.
 * @param {object} update
 * @param {object} env
 */
export async function handleUpdate(update, env) {
  if (update.message?.text) {
    await handleMessage(update.message, env);
    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
  }
}

/**
 * Send the main menu with the persistent reply keyboard attached.
 * @param {number} chatId
 * @param {object} env
 */
async function sendMainMenu(chatId, env) {
  await callTelegram(
    "sendMessage",
    {
      chat_id: chatId,
      text: getMainMenuText(),
      parse_mode: "Markdown",
      reply_markup: buildReplyKeyboard(),
    },
    env
  );

  // Send the inline menu as a second message so both keyboards are visible.
  await callTelegram(
    "sendMessage",
    {
      chat_id: chatId,
      text: "Choose a category or use the buttons below:",
      parse_mode: "Markdown",
      reply_markup: buildMainMenu(),
    },
    env
  );
}

/**
 * Handle text messages (commands and reply keyboard button presses).
 * @param {object} message
 * @param {object} env
 */
async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const userId = message.from.id;
  const text = message.text.trim();

  if (!isOwner(userId, env)) {
    if (chatType === "private") {
      await callTelegram(
        "sendMessage",
        { chat_id: chatId, text: "⛔ Access denied." },
        env
      );
    }
    return;
  }

  // Commands and reply keyboard buttons.
  if (text === "/start" || text === "📦 Menu") {
    await sendMainMenu(chatId, env);
    return;
  }

  if (text === "/help" || text === "📖 Help") {
    await callTelegram(
      "sendMessage",
      {
        chat_id: chatId,
        text: getHelpText(),
        parse_mode: "Markdown",
        reply_markup: buildReplyKeyboard(),
      },
      env
    );
    return;
  }

  if (text === "/about" || text === "👤 About") {
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

  if (text === "🔗 Links") {
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
    {
      chat_id: chatId,
      text: "Invalid command. Use /start.",
      reply_markup: buildReplyKeyboard(),
    },
    env
  );
}

/**
 * Handle inline keyboard button presses.
 * @param {object} query
 * @param {object} env
 */
async function handleCallbackQuery(query, env) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const messageId = query.message.message_id;
  const data = query.data || "";

  if (!isOwner(userId, env)) {
    if (query.message.chat.type === "private") {
      await callTelegram(
        "answerCallbackQuery",
        {
          callback_query_id: query.id,
          text: "⛔ Access denied",
          show_alert: true,
        },
        env
      );
    } else {
      await callTelegram(
        "answerCallbackQuery",
        { callback_query_id: query.id },
        env
      );
    }
    return;
  }

  await callTelegram(
    "answerCallbackQuery",
    { callback_query_id: query.id },
    env
  );

  if (data.startsWith("cat:")) {
    const categoryId = data.slice(4);
    const categoryMenu = buildCategoryMenu(categoryId);

    await callTelegram(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text: getCategoryText(categoryId),
        parse_mode: "Markdown",
        reply_markup: categoryMenu,
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