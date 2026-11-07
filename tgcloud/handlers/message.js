// Message handler (v1). Three contexts:
// - Private chat: force-join gate, then menu / projects / socials /
//   files / search / file view / download / owner stats.
// - DB group (owner only): file ingest, bundles, updates, delete, list.
// - Any other group: ignored.
// User tracking runs on every interaction (users table). The bot never
// asks a user for personal information.

import { api } from 'sdk';
import { isOwner } from '../lib/auth.js';
import { SOCIALS } from '../lib/config.js';
import {
  extractFileMeta,
  parseFileId,
  parseTitleDescription,
  categoryOptions,
  normalizeDigits,
} from '../lib/pure.js';
import {
  getSetting,
  setSetting,
  deleteSetting,
  trackUser,
  takeNextFileId,
  listFiles,
  getFile,
  insertFile,
  insertVersion,
  setFileCategory,
  setUserPhone,
  listCategories,
} from '../lib/store.js';
import {
  checkMembership,
  membershipPassed,
  missingMembership,
  isDbGroup,
  searchLibrary,
  getStatsData,
  getStatsUsers,
  getFileViewModel,
  countDownloads,
  deliverParts,
} from '../lib/library.js';
import { getProjects } from '../lib/github.js';
import {
  HELP_TEXT,
  mainMenuView,
  helpView,
  errorView,
  joinView,
  projectsView,
  socialsView,
  filesView,
  categoriesView,
  fileView,
  searchPromptView,
  statsView,
  statsUsersView,
  statsUserView,
  statsFilesView,
  statsFileView,
  confirmDeleteView,
  promptTitleView,
  titleSavedView,
} from '../lib/views.js';

async function sendScreen(chatId, view) {
  const sent = await api.sendMessage({
    chat_id: chatId,
    text: view.text,
    ...(view.reply_markup ? { reply_markup: view.reply_markup } : {}),
  });
  return sent?.message_id ?? null;
}

async function replaceScreen(chatId, messageId, view) {
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text: view.text,
      ...(view.reply_markup ? { reply_markup: view.reply_markup } : {}),
    });
    return messageId;
  } catch {
    return sendScreen(chatId, view);
  }
}

async function editTextBestEffort(chatId, messageId, text, replyMarkup) {
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

async function deleteMessageBestEffort(chatId, messageId) {
  if (!messageId) return;
  try {
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch {
    // The user's own message cannot always be deleted; ignore.
  }
}

function parseStoredMessage(value) {
  if (!value) return null;
  const [chatId, messageId] = String(value).split(':');
  if (!chatId || !messageId) return null;
  return { chatId: Number(chatId), messageId: Number(messageId) };
}

async function clearOwnerPending(ownerId) {
  await deleteSetting(`pending_title:${ownerId}`);
  await deleteSetting(`pending_bundle:${ownerId}`);
  await deleteSetting(`pending_update:${ownerId}`);
  await deleteSetting(`pending_catname:${ownerId}`);
}

async function clearUserPending(userId) {
  await deleteSetting(`pending_search:${userId}`);
  await deleteSetting(`search_query:${userId}`);
}

// --- Force-join gate (private chat). Returns true when the user may
// proceed; otherwise shows the join screen and returns false. ---
async function ensureMember(chatId, userId) {
  const check = await checkMembership(userId);
  if (membershipPassed(check)) {
    await trackUser({ id: userId }, true);
    return true;
  }
  await trackUser({ id: userId }, false);
  await sendScreen(chatId, joinView(missingMembership(check)));
  return false;
}

async function showFile(chatId, fileId, version) {
  const model = await getFileViewModel(fileId, version);
  if (!model) {
    await sendScreen(chatId, errorView('فایلی با این شماره نیست.'));
    return;
  }
  const count = await countDownloads(fileId, model.view.version);
  await sendScreen(chatId, fileView(model.view, model.parts, model.versions, count));
}

// --- Owner stats (owner only). ---
async function showStats(chatId) {
  const s = await getStatsData();
  await sendScreen(chatId, statsView(s));
}

// --- DB group: title/description/category intake for a pending
// ingest. state: { mode: 'new'|'bundle'|'update', fileId?, parts,
//   kind, category, dbChatId, dbMessageId, askChat, askMsg }
async function finalizeIngest(ownerId, state, id, title, description) {
  if (state.mode === 'update') {
    const file = await getFile(state.fileId);
    if (!file) return null;
    const updated = await insertVersion(file, state.parts, { title, description });
    return updated;
  }
  const created = await insertFile({
    id,
    title,
    description,
    category: state.category || 'سایر',
    kind: state.kind,
    parts: state.parts,
    dbChatId: state.dbChatId,
    dbMessageId: state.dbMessageId,
  });
  return created;
}

async function finishTitle(ownerId, ask, done, failText) {
  await deleteSetting(`pending_title:${ownerId}`);
  if (done) {
    await replaceScreen(ask.chatId, ask.messageId, titleSavedView(done));
  } else {
    await replaceScreen(ask.chatId, ask.messageId, errorView(failText));
  }
}

async function handlePendingTitle(chatId, messageId, ownerId, text) {
  const raw = await getSetting(`pending_title:${ownerId}`);
  if (!raw) return false;
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    await deleteSetting(`pending_title:${ownerId}`);
    return false;
  }
  const ask = { chatId: state.askChat, messageId: state.askMsg };
  const trimmed = String(text || '').trim();

  // Update flow: «همون» keeps the old title and description.
  if (state.mode === 'update' && trimmed === 'همون') {
    const file = await getFile(state.fileId);
    const done = file
      ? await finalizeIngest(ownerId, state, null, file.title, file.description)
      : null;
    await finishTitle(ownerId, ask, done, 'ثبت ورژن جدید ممکن نشد.');
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }

  const parsed = parseTitleDescription(text);
  if (state.mode === 'update') {
    const file = await getFile(state.fileId);
    const title = parsed.title || file?.title || null;
    const description = parsed.description ?? file?.description ?? null;
    const done = file
      ? await finalizeIngest(ownerId, state, null, title, description)
      : null;
    await finishTitle(ownerId, ask, done, 'ثبت ورژن جدید ممکن نشد.');
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }

  // New file / bundle: the id is always auto-sequential; the bot
  // never asks for a number.
  const id = await takeNextFileId();
  const done = await finalizeIngest(ownerId, state, id, parsed.title || null, parsed.description || null);
  await finishTitle(ownerId, ask, done, 'ثبت فایل ممکن نشد.');
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

// New-category name intake (after tapping «دسته جدید» on the ask
// message). The pending_catname value is the pending_title state.
async function handlePendingCategoryName(chatId, messageId, ownerId, text) {
  const raw = await getSetting(`pending_catname:${ownerId}`);
  if (!raw) return false;
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    await deleteSetting(`pending_catname:${ownerId}`);
    return false;
  }
  await deleteSetting(`pending_catname:${ownerId}`);
  const name = String(text || '').trim();
  if (name && name !== 'لغو') {
    state.category = name;
  }
  const names = categoryOptions(await listFiles());
  if (state.category && !names.includes(state.category)) {
    names.unshift(state.category);
  }
  await replaceScreen(
    state.askChat,
    state.askMsg,
    promptTitleView(names, state.category || 'سایر', state.mode === 'bundle'),
  );
  await setSetting(`pending_title:${ownerId}`, JSON.stringify(state));
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

// Ask for title/description + category for a pending ingest.
// Returns the ask message id.
async function askForTitle(ownerId, state) {
  const names = categoryOptions(await listFiles());
  state.category = state.category || 'سایر';
  const view = promptTitleView(names, state.category, state.mode === 'bundle');
  const sent = await api.sendMessage({
    chat_id: state.dbChatId,
    text: view.text,
    reply_to_message_id: state.dbMessageId || undefined,
    reply_markup: view.reply_markup,
  });
  state.askChat = state.dbChatId;
  state.askMsg = sent?.message_id ?? null;
  await setSetting(`pending_title:${ownerId}`, JSON.stringify(state));
  return sent?.message_id ?? null;
}


// --- DB group: incoming file. ---
async function handleDbGroupFile(chatId, message, ownerId) {
  const meta = extractFileMeta(message);
  if (!meta) return false;
  // One pending title at a time: finish it before sending the next file.
  if (await getSetting(`pending_title:${ownerId}`)) {
    await api.sendMessage({
      chat_id: chatId,
      text: 'اول عنوان فایل قبلی را بفرستید، بعد فایل بعدی را ارسال کنید.',
      reply_to_message_id: message.message_id,
    });
    return true;
  }
  const bundleRaw = await getSetting(`pending_bundle:${ownerId}`);
  if (bundleRaw) {
    let bundle;
    try {
      bundle = JSON.parse(bundleRaw);
    } catch {
      bundle = { updateFor: null, parts: [] };
    }
    bundle.parts.push({ ...meta, kind: meta.kind });
    await setSetting(`pending_bundle:${ownerId}`, JSON.stringify(bundle));
    await api.sendMessage({
      chat_id: chatId,
      text: `پارت ${bundle.parts.length} ثبت شد. برای پایان /done را بفرستید.`,
      reply_to_message_id: message.message_id,
    });
    return true;
  }
  const updateFor = await getSetting(`pending_update:${ownerId}`);
  const state = {
    mode: updateFor ? 'update' : 'new',
    fileId: updateFor || null,
    parts: [meta],
    kind: meta.kind,
    dbChatId: chatId,
    dbMessageId: message.message_id,
    askChat: null,
    askMsg: null,
  };
  await deleteSetting(`pending_update:${ownerId}`);
  await askForTitle(ownerId, state);
  return true;
}

const DB_GROUP_HELP =
  'دستورهای گروه دیتابیس:\n' +
  '/bundle — شروع بسته چندپارتی\n' +
  '/done — پایان بسته و درخواست عنوان\n' +
  '/update F001 — ورژن جدید برای یک فایل\n' +
  '/setcat F001 پرامپت — تغییر دسته یک فایل\n' +
  '/del F001 — حذف یک فایل\n' +
  '/list — لیست فایل‌ها\n' +
  '/cancel — لغو ورودی در انتظار\n' +
  'فایل بفرستید تا شناسه بگیرد؛ عنوان و توضیح و دسته را همان‌جا می‌دهید.';

async function handleDbGroupCommand(chatId, messageId, ownerId, text) {
  const parts = text.split(/\s+/);
  const command = parts[0].split('@')[0];
  if (command === '/bundle') {
    if (await getSetting(`pending_title:${ownerId}`)) {
      await sendScreen(chatId, errorView('اول عنوان فایل قبلی را بفرستید.'));
      return;
    }
    if (await getSetting(`pending_bundle:${ownerId}`)) {
      await sendScreen(chatId, errorView('بسته در حال ساخت است؛ فایل‌ها را بفرستید و /done را بزنید.'));
      return;
    }
    const updateFor = await getSetting(`pending_update:${ownerId}`);
    await setSetting(
      `pending_bundle:${ownerId}`,
      JSON.stringify({ updateFor: updateFor || null, parts: [] }),
    );
    await sendScreen(chatId, {
      text: 'حالت بسته شروع شد. پارت‌ها را پشت سر هم بفرستید و آخرش /done را بزنید.',
    });
    return;
  }
  if (command === '/done') {
    const bundleRaw = await getSetting(`pending_bundle:${ownerId}`);
    if (!bundleRaw) {
      await sendScreen(chatId, errorView('بسته‌ای در حال ساخت نیست. اول /bundle را بفرستید.'));
      return;
    }
    let bundle;
    try {
      bundle = JSON.parse(bundleRaw);
    } catch {
      bundle = { updateFor: null, parts: [] };
    }
    if (!bundle.parts || bundle.parts.length === 0) {
      await sendScreen(chatId, errorView('هنوز پارتی نفرستاده‌اید.'));
      return;
    }
    await deleteSetting(`pending_bundle:${ownerId}`);
    await deleteSetting(`pending_update:${ownerId}`);
    const state = {
      mode: bundle.updateFor ? 'update' : 'bundle',
      fileId: bundle.updateFor || null,
      parts: bundle.parts,
      kind: bundle.parts[0]?.kind || null,
      dbChatId: chatId,
      dbMessageId: bundle.parts[bundle.parts.length - 1]?.db_message_id || null,
      askChat: null,
      askMsg: null,
    };
    await askForTitle(ownerId, state);
    return;
  }
  if (command === '/update') {
    const id = parseFileId(parts[1] || '');
    if (!id) {
      await sendScreen(chatId, errorView('شناسه فایل را بفرستید. مثال: /update F001'));
      return;
    }
    const file = await getFile(id);
    if (!file) {
      await sendScreen(chatId, errorView('فایلی با این شماره نیست.'));
      return;
    }
    await setSetting(`pending_update:${ownerId}`, id);
    await sendScreen(chatId, {
      text: `ورژن جدید برای ${id} «${file.title || '(بدون عنوان)'}».\nفایل جدید را بفرستید (برای چندپارتی اول /bundle). بعد توضیح جدید را می‌دهید یا «همون» را بفرستید.`,
    });
    return;
  }
  if (command === '/setcat') {
    const id = parseFileId(parts[1] || '');
    const category = parts.slice(2).join(' ').trim();
    if (!id || !category) {
      await sendScreen(chatId, errorView('مثال: /setcat F001 پرامپت'));
      return;
    }
    const file = await getFile(id);
    if (!file) {
      await sendScreen(chatId, errorView('فایلی با این شماره نیست.'));
      return;
    }
    const updated = await setFileCategory(id, category);
    await sendScreen(chatId, {
      text: `دسته ${id} به «${updated?.category || category}» تغییر کرد.`,
    });
    return;
  }
  if (command === '/del') {
    const id = parseFileId(parts[1] || '');
    if (!id) {
      await sendScreen(chatId, errorView('شناسه فایل را بفرستید. مثال: /del F001'));
      return;
    }
    const file = await getFile(id);
    if (!file) {
      await sendScreen(chatId, errorView('فایلی با این شماره نیست.'));
      return;
    }
    await sendScreen(chatId, confirmDeleteView(file));
    return;
  }
  if (command === '/list') {
    const all = await listFiles();
    await sendScreen(chatId, filesView(all, 0, null));
    return;
  }
  if (command === '/cancel') {
    await clearOwnerPending(ownerId);
    await sendScreen(chatId, { text: 'لغو شد.' });
    return;
  }
  if (command === '/id') {
    await sendScreen(chatId, { text: `آیدی این چت: ${chatId}\nآیدی شما: ${ownerId}` });
    return;
  }
  if (command === '/help') {
    await sendScreen(chatId, { text: DB_GROUP_HELP });
    return;
  }
  return false;
}

// --- Private chat: search intake. ---
// Deliver a file the user asked for but was waiting on the optional
// phone prompt (contact shared, or «ادامه بدون شماره»). Returns
// false when nothing was pending. The file is always delivered.
async function deliverPending(chatId, userId, from) {
  const raw = await getSetting(`pending_delivery:${userId}`);
  if (!raw) return false;
  await deleteSetting(`pending_delivery:${userId}`);
  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!pending?.fileId) return false;
  const model = await getFileViewModel(pending.fileId, pending.version || null);
  if (!model) {
    await sendScreen(chatId, errorView('فایل پیدا نشد.'));
    return true;
  }
  const res = await deliverParts(chatId, model.view, model.view.version, model.parts, from, true);
  if (res.error) await sendScreen(chatId, errorView(res.error));
  return true;
}

async function handlePendingSearch(chatId, messageId, userId, text) {
  const stored = parseStoredMessage(await getSetting(`pending_search:${userId}`));
  if (!stored) return false;
  const query = text.trim();
  await deleteSetting(`pending_search:${userId}`);
  if (!query) {
    await replaceScreen(stored.chatId, stored.messageId, searchPromptView('متن جستجو خالی است.'));
    return true;
  }
  await setSetting(`search_query:${userId}`, query);
  const results = await searchLibrary(query);
  await replaceScreen(stored.chatId, stored.messageId, filesView(results, 0, query));
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

export default async function (message, ctx) {
  const from = message.from || {};
  const userId = from.id;
  const chat = message.chat || {};
  const chatId = chat.id;
  const messageId = message.message_id;
  const text = (message.text || '').trim();
  try {
    // The DB group is owner-only: everyone else is ignored there.
    if (isDbGroup(chatId)) {
      if (!isOwner(userId)) return;
      await trackUser(from, null);
      if (text.startsWith('/')) {
        const handled = await handleDbGroupCommand(chatId, messageId, userId, text);
        if (handled !== false) return;
        await sendScreen(chatId, errorView('این دستور را نمی‌شناسم. /help'));
        return;
      }
      if (await handlePendingCategoryName(chatId, messageId, userId, text)) return;
      if (await handlePendingTitle(chatId, messageId, userId, text)) return;
      if (text) {
        // Plain text with no pending title: nothing to do with it.
        return;
      }
      await handleDbGroupFile(chatId, message, userId);
      return;
    }

    // Any other group: the bot only works in private chat.
    if (chat.type && chat.type !== 'private') return;

    // Private chat.
    await trackUser(from, null);

    // Shared contact (the optional phone on download): save the phone
    // and deliver the pending file. Delivery never waits for a phone.
    if (message.contact) {
      const contact = message.contact;
      if (!contact.user_id || contact.user_id === userId) {
        await setUserPhone(userId, contact.phone_number);
      }
      await deliverPending(chatId, userId, from);
      return;
    }

    // «ادامه بدون شماره»: deliver the pending file without a phone.
    if (text === 'ادامه بدون شماره') {
      if (await deliverPending(chatId, userId, from)) return;
    }

    if (!text && !extractFileMeta(message)) {
      return;
    }
    if (text.startsWith('/')) {
      await clearUserPending(userId);
      const parts = text.split(/\s+/);
      const command = parts[0].split('@')[0];
      if (command === '/start') {
        if (!(await ensureMember(chatId, userId))) return;
        const all = await listFiles();
        await sendScreen(chatId, mainMenuView(isOwner(userId), all.length));
        return;
      }
      if (command === '/projects') {
        if (!(await ensureMember(chatId, userId))) return;
        const placeholder = await sendScreen(chatId, { text: 'در حال گرفتن پروژه‌ها…' });
        const res = await getProjects(false);
        await replaceScreen(chatId, placeholder, projectsView(res.repos, res.cachedAt, res.liveFailed));
        return;
      }
      if (command === '/socials') {
        if (!(await ensureMember(chatId, userId))) return;
        await sendScreen(chatId, socialsView(SOCIALS));
        return;
      }
      if (command === '/files') {
        if (!(await ensureMember(chatId, userId))) return;
        const all = await listFiles();
        await sendScreen(chatId, categoriesView(await listCategories(), all.length));
        return;
      }
      if (command === '/search') {
        if (!(await ensureMember(chatId, userId))) return;
        const sent = await sendScreen(chatId, searchPromptView());
        await setSetting(`pending_search:${userId}`, `${chatId}:${sent}`);
        return;
      }
      if (command === '/get') {
        if (!(await ensureMember(chatId, userId))) return;
        const id = parseFileId(parts.slice(1).join(' '));
        if (!id) {
          await sendScreen(chatId, errorView('شناسه فایل را بفرستید. مثال: /get F001'));
          return;
        }
        await showFile(chatId, id, null);
        return;
      }
      if (command === '/stats') {
        if (!isOwner(userId)) {
          await sendScreen(chatId, errorView('این بخش فقط برای صاحب بات است.'));
          return;
        }
        await showStats(chatId);
        return;
      }
      if (command === '/id') {
        await sendScreen(chatId, { text: `آیدی این چت: ${chatId}\nآیدی شما: ${userId}` });
        return;
      }
      if (command === '/help') {
        await sendScreen(chatId, { text: HELP_TEXT, reply_markup: undefined });
        return;
      }
      await sendScreen(chatId, errorView('این دستور را نمی‌شناسم. /help'));
      return;
    }
    if (await handlePendingSearch(chatId, messageId, userId, text)) return;
    // A bare id (F001) opens that file.
    const bare = normalizeDigits(text);
    if (/^F\d{1,6}$/i.test(bare)) {
      if (!(await ensureMember(chatId, userId))) return;
      const id = parseFileId(text);
      await showFile(chatId, id, null);
      return;
    }
    await sendScreen(chatId, mainMenuView(isOwner(userId), (await listFiles()).length));
  } catch (err) {
    try {
      await sendScreen(chatId, errorView('خطایی رخ داد: ' + (err?.message || 'نامشخص')));
    } catch {
      // The error reply itself failed; nothing more to do.
    }
  }
}
