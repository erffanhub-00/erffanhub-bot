import test from "node:test";
import assert from "node:assert/strict";
import { handleUpdate } from "../src/bot.js";
import { makeEnv, stubFetch, telegramCalls } from "./helpers.js";

const OWNER_ID = 123;
const OTHER_ID = 999;

function message(overrides = {}) {
  return {
    message_id: 1,
    chat: { id: 1, type: "private" },
    from: { id: OWNER_ID },
    text: "/start",
    ...overrides,
  };
}

function callback(overrides = {}) {
  return {
    id: "cb1",
    from: { id: OWNER_ID },
    message: { message_id: 10, chat: { id: 1, type: "private" } },
    data: "about",
    ...overrides,
  };
}

test("owner gate: a stranger in private gets a refusal, not the menu", async () => {
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate({ message: message({ from: { id: OTHER_ID } }) }, makeEnv());
    const sent = telegramCalls(calls, "sendMessage");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.text, "This bot is private.");
    assert.equal(sent[0].payload.reply_markup, undefined);
  } finally {
    restore();
  }
});

test("owner gate: a stranger in a group is ignored silently", async () => {
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate(
      { message: message({ chat: { id: -5, type: "supergroup" }, from: { id: OTHER_ID } }) },
      makeEnv()
    );
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test("owner /start sends the main menu", async () => {
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate({ message: message() }, makeEnv());
    const sent = telegramCalls(calls, "sendMessage");
    assert.equal(sent.length, 1);
    assert.match(sent[0].payload.text, /ErffanHub Toolbox/);
    const texts = sent[0].payload.reply_markup.inline_keyboard.flat().map((b) => b.text);
    assert.ok(texts.some((t) => t.includes("Dev Tools")));
  } finally {
    restore();
  }
});

test("owner /start@botname and /start with args both open the menu", async () => {
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate({ message: message({ text: "/start@erffanhubbot" }) }, makeEnv());
    await handleUpdate({ message: message({ text: "/start hello" }) }, makeEnv());
    assert.equal(telegramCalls(calls, "sendMessage").length, 2);
  } finally {
    restore();
  }
});

test("owner /help lists the commands, unknown command is rejected", async () => {
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate({ message: message({ text: "/help" }) }, makeEnv());
    await handleUpdate({ message: message({ text: "/unknown" }) }, makeEnv());
    await handleUpdate({ message: message({ text: "hello" }) }, makeEnv());
    const sent = telegramCalls(calls, "sendMessage");
    assert.equal(sent.length, 3);
    assert.match(sent[0].payload.text, /\/start/);
    assert.equal(sent[1].payload.text, "Invalid command. Use /start.");
    assert.equal(sent[2].payload.text, "Invalid command. Use /start.");
  } finally {
    restore();
  }
});

test("callback: a stranger gets an alert, the message is not edited", async () => {
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate({ callback_query: callback({ from: { id: OTHER_ID } }) }, makeEnv());
    const answered = telegramCalls(calls, "answerCallbackQuery");
    assert.equal(answered.length, 1);
    assert.equal(answered[0].payload.show_alert, true);
    assert.equal(telegramCalls(calls, "editMessageText").length, 0);
  } finally {
    restore();
  }
});

test("callback: owner opens a category and goes back to the main menu", async () => {
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate({ callback_query: callback({ data: "cat:dev" }) }, makeEnv());
    await handleUpdate({ callback_query: callback({ data: "back:main" }) }, makeEnv());
    const edited = telegramCalls(calls, "editMessageText");
    assert.equal(edited.length, 2);
    assert.match(edited[0].payload.text, /Dev Tools/);
    assert.match(edited[1].payload.text, /ErffanHub Toolbox/);
    assert.equal(telegramCalls(calls, "answerCallbackQuery").length, 2);
  } finally {
    restore();
  }
});

test("callback: unknown category is reported, unknown button does nothing", async () => {
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate({ callback_query: callback({ data: "cat:nope" }) }, makeEnv());
    await handleUpdate({ callback_query: callback({ data: "nonsense" }) }, makeEnv());
    const edited = telegramCalls(calls, "editMessageText");
    assert.equal(edited.length, 1);
    assert.equal(edited[0].payload.text, "❌ Category not found.");
  } finally {
    restore();
  }
});

test("file: owner file in the storage group is saved and confirmed", async () => {
  const env = makeEnv();
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate(
      {
        message: {
          message_id: 7,
          chat: { id: -100, type: "supergroup" },
          from: { id: OWNER_ID },
          document: { file_id: "file1", file_name: "report.pdf", mime_type: "application/pdf" },
          caption: "#Dev notes",
        },
      },
      env
    );
    assert.equal(env.DB.saved.length, 1);
    assert.deepEqual(env.DB.saved[0], {
      file_id: "file1",
      file_name: "report.pdf",
      file_extension: "pdf",
      category: "dev",
    });
    const sent = telegramCalls(calls, "sendMessage");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.text, "✅ Saved: report.pdf");
  } finally {
    restore();
  }
});

test("file: same file twice is saved once, other chats and strangers are ignored", async () => {
  const env = makeEnv();
  const { calls, restore } = stubFetch();
  const doc = { file_id: "file1", file_name: "a.pdf", mime_type: "application/pdf" };
  const base = {
    message_id: 7,
    chat: { id: -100, type: "supergroup" },
    from: { id: OWNER_ID },
    document: doc,
  };
  try {
    await handleUpdate({ message: base }, env);
    await handleUpdate({ message: base }, env);
    await handleUpdate({ message: { ...base, chat: { id: -200, type: "supergroup" } } }, env);
    await handleUpdate({ message: { ...base, from: { id: OTHER_ID } } }, env);
    assert.equal(env.DB.saved.length, 1);
    assert.equal(telegramCalls(calls, "sendMessage").length, 1);
  } finally {
    restore();
  }
});

test("file: a photo without a name is saved as a jpg with a stable name", async () => {
  const env = makeEnv();
  const { calls, restore } = stubFetch();
  try {
    await handleUpdate(
      {
        message: {
          message_id: 8,
          chat: { id: -100, type: "supergroup" },
          from: { id: OWNER_ID },
          photo: [
            { file_id: "small", file_size: 100 },
            { file_id: "bigphoto1", file_size: 900 },
          ],
        },
      },
      env
    );
    assert.equal(env.DB.saved.length, 1);
    assert.equal(env.DB.saved[0].file_id, "bigphoto1");
    assert.match(env.DB.saved[0].file_name, /^photo_.*\.jpg$/);
    assert.equal(env.DB.saved[0].file_extension, "jpg");
    assert.equal(telegramCalls(calls, "sendMessage").length, 1);
  } finally {
    restore();
  }
});
