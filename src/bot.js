/**
 * Telegram update routing: files, inline queries, commands, button presses.
 */
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
import { isOwner } from "./auth.js";
import { sendMessage, editMessageText, answerCallbackQuery } from "./telegram.js";
import { parseCommand } from "./commands.js";
import { hasFile, saveFileMessage } from "./files.js";

/**
 * Route incoming Telegram updates.
 */
export async function handleUpdate(update, env) {
  try {
    // Save files from the dedicated storage group.
    if (update.message && hasFile(update.message)) {
      await saveFileMessage(update.message, env);
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
  } catch (err) {
    console.error("Failed to handle update:", err.message);
  }
}

const BACK_BUTTON = [{ text: "⬅️ Back", callback_data: "back:main" }];

const COMMAND_HANDLERS = {
  start: (chatId, env) =>
    sendMessage(chatId, getMainMenuText(), env, {
      parse_mode: "Markdown",
      reply_markup: buildMainMenu(),
    }),
  help: (chatId, env) =>
    sendMessage(chatId, getHelpText(), env, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [BACK_BUTTON] },
    }),
  about: (chatId, env) =>
    sendMessage(chatId, getAboutText(), env, {
      parse_mode: "Markdown",
      reply_markup: buildAboutMenu(owner.links),
    }),
  links: (chatId, env) =>
    sendMessage(chatId, getLinksText(), env, {
      parse_mode: "Markdown",
      reply_markup: buildAboutMenu(owner.links),
    }),
};

/**
 * Handle text messages and commands. Only the owner gets a reply in private
 * chats; everyone else is ignored silently in groups.
 */
async function handleMessage(message, env) {
  const chatId = message.chat.id;

  if (!isOwner(message.from?.id, env)) {
    if (message.chat.type === "private") {
      await sendMessage(chatId, "This bot is private.", env);
    }
    return;
  }

  const handler = COMMAND_HANDLERS[parseCommand(message.text)];
  if (handler) {
    await handler(chatId, env);
    return;
  }

  await sendMessage(chatId, "Invalid command. Use /start.", env);
}

function editMenu(chatId, messageId, text, markup, env) {
  return editMessageText(chatId, messageId, text, env, {
    parse_mode: "Markdown",
    reply_markup: markup,
  });
}

const CALLBACK_SCREENS = {
  about: () => [getAboutText(), buildAboutMenu(owner.links)],
  help: () => [getHelpText(), { inline_keyboard: [BACK_BUTTON] }],
  links: () => [getLinksText(), buildAboutMenu(owner.links)],
  "back:main": () => [getMainMenuText(), buildMainMenu()],
};

/**
 * Handle inline keyboard button presses.
 */
async function handleCallbackQuery(query, env) {
  if (!isOwner(query.from?.id, env)) {
    await answerCallbackQuery(query.id, env, {
      text: "This bot is private.",
      show_alert: true,
    });
    return;
  }
  if (!query.message) return;

  await answerCallbackQuery(query.id, env);

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data || "";

  if (data.startsWith("cat:")) {
    const categoryId = data.slice(4);
    await editMenu(chatId, messageId, getCategoryText(categoryId), buildCategoryMenu(categoryId), env);
    return;
  }

  const screen = CALLBACK_SCREENS[data];
  if (!screen) return;

  const [text, markup] = screen();
  await editMenu(chatId, messageId, text, markup, env);
}
