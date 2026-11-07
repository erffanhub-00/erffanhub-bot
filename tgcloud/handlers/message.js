// Message handler (v2). Three contexts:
// - Private chat: force-join gate, then menu / projects / socials /
//   files / search / file view / download / wallet / owner stats.
// - DB group (owner only): file ingest, bundles, updates, delete, list,
//   price setting.
// - Receipts group (owner only): the manual /rx fallback.
// - Any other group: ignored.
// Navigation model: every screen is shown by deleting the previous
// screen message and sending a fresh one at the bottom of the chat
// (the stored screen id lives in settings). Delivered files delete
// themselves 60 seconds after delivery and one-off notices after 20
// seconds (see lib/library.js runCleanup — Serverless has no timer,
// so expiry is swept on every incoming update). The user's own
// command/text messages are deleted after handling (best-effort;
// Telegram forbids deleting messages older than 48 hours). User
// tracking runs on every interaction. The bot never asks a user for
// personal information.

import { api } from 'sdk';
import { isOwner } from '../lib/auth.js';
import { SOCIALS, RECEIPTS_GROUP_ID, OWNER_TELEGRAM_ID } from '../lib/config.js';
import {
  extractFileMeta,
  parseFileId,
  parseTitleDescription,
  parseAmount,
  categoryOptions,
  normalizeDigits,
  isPremiumFile,
} from '../lib/pure.js';
import {
  getSetting,
  setSetting,
  deleteSetting,
  trackUser,
  takeNextFileId,
  listFiles,
  getFile,
  finalizeIngest,
  setFileCategory,
  setFilePrice,
  setUserPhone,
  listCategories,
  getUser,
  getUserBalance,
  setUserBalance,
  listUserTransactions,
  insertTransaction,
  getTransactionByReceiptMessage,
  getUserDownloads,
} from '../lib/store.js';
import {
  checkMembership,
  membershipPassed,
  missingMembership,
  isDbGroup,
  isReceiptsGroup,
  searchLibrary,
  searchStatsUsers,
  getStatsData,
  getStatsUsers,
  getFileViewModel,
  countDownloads,
  deliverParts,
  purchaseFile,
  settleReceipt,
  receiptCaptionText,
  receiptApprovedText,
  runCleanup,
  sendExpiring,
  getFileDownloaders,
} from '../lib/library.js';
import { getProjects } from '../lib/github.js';
import { receiptKeyboard, backToMenu, supportReplyKeyboard } from '../lib/keyboards.js';
import {
  HELP_TEXT,
  mainMenuView,
  helpView,
  errorView,
  dbErrorView,
  joinView,
  projectsView,
  socialsView,
  filesView,
  categoriesView,
  fileView,
  searchPromptView,
  walletView,
  chargeAmountView,
  chargeCustomAmountView,
  receiptSentView,
  premiumPayView,
  statsView,
  userSearchPromptView,
  userSearchResultsView,
  notifyPromptView,
  notifyConfirmView,
  notifyAudienceView,
  statsUserView,
  supportPromptView,
  balancePromptView,
  confirmDeleteView,
  promptTitleView,
  pricePromptView,
  priceAmountPromptView,
  titleSavedView,
} from '../lib/views.js';

const screenKey = (userId) => `screen:${userId}`;
const screenDbKey = (ownerId) => `screen_db:${ownerId}`;

async function deleteMessageBestEffort(chatId, messageId) {
  if (!messageId) return;
  try {
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch {
    // Messages older than 48h cannot be deleted; ignore.
  }
}

function parseStoredMessage(value) {
  if (!value) return null;
  const [chatId, messageId] = String(value).split(':');
  if (!chatId || !messageId) return null;
  return { chatId: Number(chatId), messageId: Number(messageId) };
}

async function deleteStoredScreen(key) {
  const stored = parseStoredMessage(await getSetting(key));
  if (!stored) return;
  await deleteSetting(key);
  await deleteMessageBestEffort(stored.chatId, stored.messageId);
}

// Show a screen: delete the previous screen for this key, then send
// a fresh message at the bottom of the chat and remember it. Returns
// the new message id. `replyTo` threads the message under another one
// (the DB-group title prompt).
async function showScreen(chatId, view, key, replyTo) {
  if (key) await deleteStoredScreen(key);
  const sent = await api.sendMessage({
    chat_id: chatId,
    text: view.text,
    ...(view.reply_markup ? { reply_markup: view.reply_markup } : {}),
    ...(replyTo ? { reply_to_message_id: replyTo } : {}),
  });
  const id = sent?.message_id ?? null;
  if (key && id) await setSetting(key, `${chatId}:${id}`);
  return id;
}

async function showPrivate(chatId, userId, view) {
  return showScreen(chatId, view, screenKey(userId));
}

async function showDb(chatId, ownerId, view, replyTo) {
  return showScreen(chatId, view, screenDbKey(ownerId), replyTo);
}

async function clearOwnerPending(ownerId) {
  await deleteSetting(`pending_title:${ownerId}`);
  await deleteSetting(`pending_bundle:${ownerId}`);
  await deleteSetting(`pending_update:${ownerId}`);
  await deleteSetting(`pending_catname:${ownerId}`);
  await deleteSetting(`pending_price:${ownerId}`);
  await deleteSetting(`pending_price_amount:${ownerId}`);
}

async function clearUserPending(userId) {
  await deleteSetting(`pending_search:${userId}`);
  await deleteSetting(`search_query:${userId}`);
  await deleteSetting(`pending_charge_amount:${userId}`);
  await deleteSetting(`pending_charge_receipt:${userId}`);
  await deleteSetting(`pending_usersearch:${userId}`);
  await deleteSetting(`user_search_query:${userId}`);
  await deleteSetting(`pending_broadcast:${userId}`);
  await deleteSetting(`pending_broadcast_text:${userId}`);
  await deleteSetting(`pending_notify_user:${userId}`);
  await deleteSetting(`pending_notify_file:${userId}`);
  await deleteSetting(`pending_notify_return:${userId}`);
  await deleteSetting(`pending_support:${userId}`);
  await deleteSetting(`pending_support_reply:${userId}`);
  await deleteSetting(`pending_balance:${userId}`);
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
  await showPrivate(chatId, userId, joinView(missingMembership(check)));
  return false;
}

async function showFile(chatId, userId, fileId, version) {
  const model = await getFileViewModel(fileId, version);
  if (!model) {
    await showPrivate(chatId, userId, errorView('فایلی با این شماره نیست.'));
    return;
  }
  const count = await countDownloads(fileId, model.view.version);
  const balance = await getUserBalance(userId);
  await showPrivate(chatId, userId, fileView(model.view, model.parts, model.versions, count, balance));
}

// --- Owner stats (owner only). ---
async function showStats(chatId, userId) {
  const s = await getStatsData();
  await showPrivate(chatId, userId, statsView(s));
}

// --- DB group: title/description/category intake for a pending
// ingest. state: { mode: 'new'|'bundle'|'update', fileId?, parts,
//   kind, category, dbChatId, dbMessageId, askChat, askMsg }
async function finishTitle(chatId, ownerId, done, failText) {
  if (done) {
    await showDb(chatId, ownerId, titleSavedView(done));
  } else {
    await showDb(chatId, ownerId, dbErrorView(failText));
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
  const trimmed = String(text || '').trim();

  // Update flow: «همون» keeps the old title and description (and the
  // old price — updates never ask for a price).
  if (state.mode === 'update' && trimmed === 'همون') {
    const file = await getFile(state.fileId);
    const done = file
      ? await finalizeIngest(state, null, file.title, file.description, 0)
      : null;
    await deleteSetting(`pending_title:${ownerId}`);
    await finishTitle(chatId, ownerId, done, 'ثبت ورژن جدید ممکن نشد.');
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }

  const parsed = parseTitleDescription(text);
  if (state.mode === 'update') {
    const file = await getFile(state.fileId);
    const title = parsed.title || file?.title || null;
    const description = parsed.description ?? file?.description ?? null;
    const done = file
      ? await finalizeIngest(state, null, title, description, 0)
      : null;
    await deleteSetting(`pending_title:${ownerId}`);
    await finishTitle(chatId, ownerId, done, 'ثبت ورژن جدید ممکن نشد.');
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }

  // New file / bundle: ask free vs premium first; the id is assigned
  // at save time (auto-sequential — the bot never asks for a number).
  await setSetting(
    `pending_price:${ownerId}`,
    JSON.stringify({ ...state, title: parsed.title || null, description: parsed.description || null }),
  );
  await deleteSetting(`pending_title:${ownerId}`);
  await showDb(chatId, ownerId, pricePromptView(parsed.title || null));
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

// Premium price intake (after the owner tapped «💰 پرمیوم»).
async function handlePendingPriceAmount(chatId, messageId, ownerId, text) {
  const raw = await getSetting(`pending_price_amount:${ownerId}`);
  if (!raw) return false;
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    await deleteSetting(`pending_price_amount:${ownerId}`);
    return false;
  }
  const price = parseAmount(text, true);
  if (price === null) {
    await showDb(chatId, ownerId, priceAmountPromptView('مبلغ درست نیست. یک عدد به تومان بفرستید.'));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  await deleteSetting(`pending_price_amount:${ownerId}`);
  const id = await takeNextFileId();
  const done = await finalizeIngest(state, id, state.title, state.description, price);
  await finishTitle(chatId, ownerId, done, 'ثبت فایل ممکن نشد.');
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
  const id = await showDb(
    state.askChat,
    ownerId,
    promptTitleView(names, state.category || 'سایر', state.mode === 'bundle'),
  );
  state.askMsg = id;
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
  const id = await showScreen(state.dbChatId, view, screenDbKey(ownerId), state.dbMessageId || undefined);
  state.askChat = state.dbChatId;
  state.askMsg = id;
  await setSetting(`pending_title:${ownerId}`, JSON.stringify(state));
  return id;
}

// --- DB group: incoming file. ---
async function handleDbGroupFile(chatId, message, ownerId) {
  const meta = extractFileMeta(message);
  if (!meta) return false;
  // One pending title/price at a time: finish it before sending the
  // next file.
  if (
    (await getSetting(`pending_title:${ownerId}`)) ||
    (await getSetting(`pending_price:${ownerId}`)) ||
    (await getSetting(`pending_price_amount:${ownerId}`))
  ) {
    await showDb(chatId, ownerId, dbErrorView('اول فایل قبلی را کامل کنید، بعد فایل بعدی را ارسال کنید.'));
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
    await showDb(chatId, ownerId, {
      text: `پارت ${bundle.parts.length} ثبت شد. برای پایان /done را بفرستید.`,
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
  '/setprice F001 50000 — تغییر قیمت یک فایل (صفر یعنی رایگان)\n' +
  '/del F001 — حذف یک فایل\n' +
  '/list — لیست فایل‌ها\n' +
  '/cancel — لغو ورودی در انتظار\n' +
  'فایل بفرستید تا شناسه بگیرد؛ عنوان و توضیح و دسته و قیمت را همان‌جا می‌دهید.';

async function handleDbGroupCommand(chatId, messageId, ownerId, text) {
  await deleteMessageBestEffort(chatId, messageId);
  const parts = text.split(/\s+/);
  const command = parts[0].split('@')[0];
  if (command === '/bundle') {
    if (await getSetting(`pending_title:${ownerId}`)) {
      await showDb(chatId, ownerId, dbErrorView('اول عنوان فایل قبلی را بفرستید.'));
      return;
    }
    if (await getSetting(`pending_bundle:${ownerId}`)) {
      await showDb(chatId, ownerId, dbErrorView('بسته در حال ساخت است؛ فایل‌ها را بفرستید و /done را بزنید.'));
      return;
    }
    const updateFor = await getSetting(`pending_update:${ownerId}`);
    await setSetting(
      `pending_bundle:${ownerId}`,
      JSON.stringify({ updateFor: updateFor || null, parts: [] }),
    );
    await showDb(chatId, ownerId, {
      text: 'حالت بسته شروع شد. پارت‌ها را پشت سر هم بفرستید و آخرش /done را بزنید.',
    });
    return;
  }
  if (command === '/done') {
    const bundleRaw = await getSetting(`pending_bundle:${ownerId}`);
    if (!bundleRaw) {
      await showDb(chatId, ownerId, dbErrorView('بسته‌ای در حال ساخت نیست. اول /bundle را بفرستید.'));
      return;
    }
    let bundle;
    try {
      bundle = JSON.parse(bundleRaw);
    } catch {
      bundle = { updateFor: null, parts: [] };
    }
    if (!bundle.parts || bundle.parts.length === 0) {
      await showDb(chatId, ownerId, dbErrorView('هنوز پارتی نفرستاده‌اید.'));
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
      await showDb(chatId, ownerId, dbErrorView('شناسه فایل را بفرستید. مثال: /update F001'));
      return;
    }
    const file = await getFile(id);
    if (!file) {
      await showDb(chatId, ownerId, dbErrorView('فایلی با این شماره نیست.'));
      return;
    }
    await setSetting(`pending_update:${ownerId}`, id);
    await showDb(chatId, ownerId, {
      text: `ورژن جدید برای ${id} «${file.title || '(بدون عنوان)'}».\nفایل جدید را بفرستید (برای چندپارتی اول /bundle). بعد توضیح جدید را می‌دهید یا «همون» را بفرستید.`,
    });
    return;
  }
  if (command === '/setcat') {
    const id = parseFileId(parts[1] || '');
    const category = parts.slice(2).join(' ').trim();
    if (!id || !category) {
      await showDb(chatId, ownerId, dbErrorView('مثال: /setcat F001 پرامپت'));
      return;
    }
    const file = await getFile(id);
    if (!file) {
      await showDb(chatId, ownerId, dbErrorView('فایلی با این شماره نیست.'));
      return;
    }
    const updated = await setFileCategory(id, category);
    await showDb(chatId, ownerId, {
      text: `دسته ${id} به «${updated?.category || category}» تغییر کرد.`,
    });
    return;
  }
  if (command === '/setprice') {
    const id = parseFileId(parts[1] || '');
    const price = parseAmount(parts.slice(2).join(' '), true);
    if (!id || price === null) {
      await showDb(chatId, ownerId, dbErrorView('مثال: /setprice F001 50000 — صفر یعنی رایگان.'));
      return;
    }
    const file = await getFile(id);
    if (!file) {
      await showDb(chatId, ownerId, dbErrorView('فایلی با این شماره نیست.'));
      return;
    }
    const updated = await setFilePrice(id, price);
    await showDb(chatId, ownerId, {
      text:
        price > 0
          ? `قیمت ${id} شد ${price.toLocaleString('fa-IR')} تومان (پرمیوم).`
          : `فایل ${id} رایگان شد.`,
    });
    return;
  }
  if (command === '/del') {
    const id = parseFileId(parts[1] || '');
    if (!id) {
      await showDb(chatId, ownerId, dbErrorView('شناسه فایل را بفرستید. مثال: /del F001'));
      return;
    }
    const file = await getFile(id);
    if (!file) {
      await showDb(chatId, ownerId, dbErrorView('فایلی با این شماره نیست.'));
      return;
    }
    await showDb(chatId, ownerId, confirmDeleteView(file));
    return;
  }
  if (command === '/list') {
    const all = await listFiles();
    await showDb(chatId, ownerId, filesView(all, 0, null, 'db:cls', true));
    return;
  }
  if (command === '/cancel') {
    await clearOwnerPending(ownerId);
    await showDb(chatId, ownerId, { text: 'لغو شد.' });
    return;
  }
  if (command === '/help') {
    await showDb(chatId, ownerId, { text: DB_GROUP_HELP });
    return;
  }
  return false;
}

// --- Receipts group: manual /rx fallback. Buttons live in the
// callback handler. Receipts are records — never auto-deleted, except
// rejected ones (deleted when the owner rejects them). ---
async function handleReceiptsGroupCommand(chatId, messageId, ownerId, text) {
  await deleteMessageBestEffort(chatId, messageId);
  const parts = text.split(/\s+/);
  const command = parts[0].split('@')[0];
  if (command === '/rx') {
    const mid = Number(parts[1] || 0);
    const decision = String(parts[2] || '').toLowerCase();
    if (!mid || (decision !== 'ok' && decision !== 'no')) {
      await sendExpiring(chatId, 'مثال: /rx 123 ok — تایید رسید با آن شماره پیام، یا /rx 123 no برای رد.');
      return true;
    }
    const tx = await getTransactionByReceiptMessage(mid);
    const res = await settleReceipt(tx, decision === 'ok');
    if (res.status === 'missing') {
      await sendExpiring(chatId, `رسیدی با شماره پیام ${mid} پیدا نشد.`);
      return true;
    }
    if (res.status === 'already') {
      await sendExpiring(chatId, `رسید ${mid} قبلاً بررسی شده است.`);
      return true;
    }
    if (res.status === 'approved') {
      try {
        await api.editMessageCaption({
          chat_id: chatId,
          message_id: mid,
          caption: receiptApprovedText(tx, await getUser(tx.user_id)),
        });
      } catch {
        // Caption edit is cosmetic; the money already moved.
      }
      try {
        await api.editMessageReplyMarkup({
          chat_id: chatId,
          message_id: mid,
          reply_markup: { inline_keyboard: [] },
        });
      } catch {
        // Buttons stay; the receipt is already decided (idempotent).
      }
      await sendExpiring(chatId, `رسید ${mid} تایید شد.`);
      return true;
    }
    await deleteMessageBestEffort(chatId, mid);
    await sendExpiring(chatId, `رسید ${mid} رد شد و پیامش پاک شد.`);
    return true;
  }
  return false;
}

// --- Private chat: search intake. ---
// Deliver a file the user asked for but was waiting on the optional
// phone prompt (contact shared, or «ادامه بدون شماره»). Returns
// false when nothing was pending. The file is always delivered.
// A premium file is paid for here, at delivery time — never before.
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
    await showPrivate(chatId, userId, errorView('فایل پیدا نشد.'));
    return true;
  }
  if (isPremiumFile(model.view)) {
    const bought = await purchaseFile(from, model.view, model.view.version);
    if (bought.error) {
      await setSetting(
        `pending_purchase:${userId}`,
        JSON.stringify({ fileId: pending.fileId, version: model.view.version }),
      );
      await showPrivate(chatId, userId, premiumPayView(model.view, bought.balance));
      return true;
    }
  }
  const res = await deliverParts(chatId, model.view, model.view.version, model.parts, from, true);
  if (res.error) await showPrivate(chatId, userId, errorView(res.error));
  return true;
}

async function handlePendingSearch(chatId, messageId, userId, text) {
  if (!(await getSetting(`pending_search:${userId}`))) return false;
  const query = text.trim();
  await deleteSetting(`pending_search:${userId}`);
  if (!query) {
    await showPrivate(chatId, userId, searchPromptView('متن جستجو خالی است.'));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  await setSetting(`search_query:${userId}`, query);
  const results = await searchLibrary(query);
  await showPrivate(chatId, userId, filesView(results, 0, query));
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

// --- Private chat: wallet top-up intake. ---
// Custom amount typed by the user (after «مبلغ دلخواه»).
async function handlePendingChargeAmount(chatId, messageId, userId, text) {
  if (!(await getSetting(`pending_charge_amount:${userId}`))) return false;
  const amount = parseAmount(text, false);
  if (amount === null) {
    await showPrivate(chatId, userId, chargeCustomAmountView('مبلغ درست نیست. یک عدد به تومان بفرستید.'));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  await deleteSetting(`pending_charge_amount:${userId}`);
  await setSetting(`pending_charge_receipt:${userId}`, JSON.stringify({ amount }));
  await showPrivate(chatId, userId, chargeAmountView(amount));
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

// Receipt photo for a pending top-up: copy it into the receipts group
// with approve/reject buttons and record a pending transaction.
async function handleReceiptPhoto(chatId, message, userId, from) {
  const raw = await getSetting(`pending_charge_receipt:${userId}`);
  if (!raw) return false;
  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    await deleteSetting(`pending_charge_receipt:${userId}`);
    return false;
  }
  const amount = Number(pending?.amount) || 0;
  if (!amount) {
    await deleteSetting(`pending_charge_receipt:${userId}`);
    return false;
  }
  const sizes = Array.isArray(message.photo)
    ? [...message.photo].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))
    : [];
  const photo = sizes[0];
  if (!photo?.file_id) return false;
  if (!RECEIPTS_GROUP_ID) {
    await deleteSetting(`pending_charge_receipt:${userId}`);
    await showPrivate(chatId, userId, errorView('گروه تراکنش‌ها هنوز تنظیم نشده است. صاحب بات باید آن را بسازد.'));
    return true;
  }
  const sent = await api.sendPhoto({
    chat_id: RECEIPTS_GROUP_ID,
    photo: photo.file_id,
    caption: receiptCaptionText({ user_id: userId, amount }, from),
  });
  const mid = sent?.message_id ?? null;
  if (!mid) {
    await showPrivate(chatId, userId, errorView('ارسال رسید ممکن نشد. دوباره امتحان کنید.'));
    return true;
  }
  await insertTransaction({
    userId,
    username: from.username || null,
    kind: 'charge',
    amount,
    status: 'pending',
    receiptFileId: photo.file_id,
    receiptChatId: RECEIPTS_GROUP_ID,
    receiptMessageId: mid,
  });
  try {
    await api.editMessageReplyMarkup({
      chat_id: RECEIPTS_GROUP_ID,
      message_id: mid,
      reply_markup: receiptKeyboard(mid),
    });
  } catch {
    // Buttons missing: the owner can still decide with /rx <id> ok|no.
  }
  await deleteSetting(`pending_charge_receipt:${userId}`);
  await deleteMessageBestEffort(chatId, message.message_id);
  await showPrivate(chatId, userId, receiptSentView());
  return true;
}

// --- Private chat: owner intakes (user search, broadcast, notify). ---
async function handlePendingUserSearch(chatId, messageId, ownerId, text) {
  if (!(await getSetting(`pending_usersearch:${ownerId}`))) return false;
  const query = text.trim();
  await deleteSetting(`pending_usersearch:${ownerId}`);
  if (!query) {
    await showPrivate(chatId, ownerId, userSearchPromptView('متن جستجو خالی است.'));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  await setSetting(`user_search_query:${ownerId}`, query);
  const results = await searchStatsUsers(query);
  await showPrivate(chatId, ownerId, userSearchResultsView(results, 0, query));
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

async function handlePendingBroadcast(chatId, messageId, ownerId, text) {
  if (!(await getSetting(`pending_broadcast:${ownerId}`))) return false;
  const body = text.trim();
  if (!body) {
    await showPrivate(chatId, ownerId, notifyPromptView('متن اطلاع‌رسانی خالی است.'));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  await setSetting(`pending_broadcast_text:${ownerId}`, body);
  const fileId = await getSetting(`pending_notify_file:${ownerId}`);
  const count = fileId
    ? (await getFileDownloaders(fileId)).length
    : (await getStatsUsers()).length;
  await showPrivate(chatId, ownerId, notifyConfirmView(count, body));
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

async function handlePendingNotifyUser(chatId, messageId, ownerId, text) {
  const raw = await getSetting(`pending_notify_user:${ownerId}`);
  if (!raw) return false;
  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    await deleteSetting(`pending_notify_user:${ownerId}`);
    return false;
  }
  const body = text.trim();
  await deleteSetting(`pending_notify_user:${ownerId}`);
  if (!body) {
    await showPrivate(chatId, ownerId, errorView('متن پیام خالی است.'));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  try {
    await api.sendMessage({ chat_id: pending.userId, text: body });
    const ret = await getSetting(`pending_notify_return:${ownerId}`);
    await deleteSetting(`pending_notify_return:${ownerId}`);
    if (ret === 'menu') {
      await showPrivate(chatId, ownerId, notifyAudienceView('پیام ارسال شد ✅'));
    } else {
      await showPrivate(chatId, ownerId, { text: 'پیام ارسال شد ✅', reply_markup: backToMenu() });
    }
  } catch {
    await showPrivate(chatId, ownerId, errorView('ارسال پیام ممکن نشد — شاید کاربر بات را بلاک کرده است.'));
  }
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

// --- Private chat: support. The user sends one message (text,
// photo or file); it is forwarded to the owner, who answers from the
// reply button on the forwarded message's info line. ---
async function handlePendingSupport(chatId, message, userId, from) {
  if (!(await getSetting(`pending_support:${userId}`))) return false;
  // A command cancels support mode instead of being forwarded.
  if ((message.text || '').trim().startsWith('/')) return false;
  await deleteSetting(`pending_support:${userId}`);
  if (!OWNER_TELEGRAM_ID) {
    await showPrivate(chatId, userId, errorView('پشتیبانی هنوز تنظیم نشده است.'));
    return true;
  }
  const who = from.username
    ? '@' + from.username
    : [from.first_name, from.last_name].filter(Boolean).join(' ') || `کاربر ${userId}`;
  let forwarded = false;
  try {
    await api.forwardMessage({
      chat_id: OWNER_TELEGRAM_ID,
      from_chat_id: chatId,
      message_id: message.message_id,
    });
    forwarded = true;
  } catch {
    // Forwarding can fail (privacy settings); fall back to a summary.
  }
  if (!forwarded) {
    const body = (message.text || '').trim() || '(فایل یا عکس — فوروارد نشد)';
    try {
      await api.sendMessage({
        chat_id: OWNER_TELEGRAM_ID,
        text: `💬 پیام پشتیبانی از ${who} (آیدی: ${userId}):\n${body}`,
      });
    } catch {
      // The owner is unreachable; the user still gets an answer below.
    }
  }
  try {
    await api.sendMessage({
      chat_id: OWNER_TELEGRAM_ID,
      text: `💬 پیام پشتیبانی\nاز: ${who} (آیدی: ${userId})\nبرای پاسخ، دکمه زیر را بزن.`,
      reply_markup: supportReplyKeyboard(userId),
    });
  } catch {
    // The owner is unreachable; the user still gets an answer below.
  }
  await deleteMessageBestEffort(chatId, message.message_id);
  await showPrivate(chatId, userId, {
    text: 'پیامت به پشتیبانی فرستاده شد ✅\nبه‌زودی جوابت را می‌دهم.',
    reply_markup: backToMenu(),
  });
  return true;
}

// --- Private chat (owner): answering a support message. The owner's
// message is forwarded to the user as-is (text, photo or file). ---
async function handlePendingSupportReply(chatId, message, ownerId) {
  const raw = await getSetting(`pending_support_reply:${ownerId}`);
  if (!raw) return false;
  // A command cancels the reply instead of being forwarded.
  if ((message.text || '').trim().startsWith('/')) return false;
  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    await deleteSetting(`pending_support_reply:${ownerId}`);
    return false;
  }
  await deleteSetting(`pending_support_reply:${ownerId}`);
  const target = Number(pending?.userId) || 0;
  if (!target) return false;
  let sent = false;
  try {
    await api.forwardMessage({
      chat_id: target,
      from_chat_id: chatId,
      message_id: message.message_id,
    });
    sent = true;
  } catch {
    // Forwarding can fail; fall back to plain text when there is any.
  }
  if (!sent && (message.text || '').trim()) {
    try {
      await api.sendMessage({ chat_id: target, text: (message.text || '').trim() });
      sent = true;
    } catch {
      sent = false;
    }
  }
  if (sent) {
    await showPrivate(chatId, ownerId, { text: 'پاسخ ارسال شد ✅', reply_markup: backToMenu() });
  } else {
    await showPrivate(chatId, ownerId, errorView('ارسال پاسخ ممکن نشد — شاید کاربر بات را بلاک کرده است.'));
  }
  return true;
}

// --- Private chat (owner): manual wallet balance fix. The owner
// types the NEW balance; the change is written to the ledger as a
// manual adjustment (kind 'adjust') so the money history stays
// auditable. ---
async function handlePendingBalance(chatId, messageId, ownerId, text) {
  const raw = await getSetting(`pending_balance:${ownerId}`);
  if (!raw) return false;
  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    await deleteSetting(`pending_balance:${ownerId}`);
    return false;
  }
  const target = Number(pending?.userId) || 0;
  const user = target ? await getUser(target) : null;
  if (!user) {
    await deleteSetting(`pending_balance:${ownerId}`);
    await showPrivate(chatId, ownerId, errorView('کاربر پیدا نشد.'));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  const amount = parseAmount(text, true);
  if (amount === null) {
    await showPrivate(chatId, ownerId, balancePromptView(user, 'مبلغ درست نیست. یک عدد به تومان بفرستید.'));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  const oldBalance = Number(user.balance) || 0;
  await deleteSetting(`pending_balance:${ownerId}`);
  const next = await setUserBalance(target, amount);
  const delta = next - oldBalance;
  if (delta !== 0) {
    await insertTransaction({
      userId: target,
      username: user.username || null,
      kind: 'adjust',
      amount: delta,
      status: 'approved',
    });
  }
  const history = await getUserDownloads(target);
  const updated = await getUser(target);
  await showPrivate(chatId, ownerId, statsUserView(updated, history));
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
    // Sweep self-deleting messages whose time has come. Serverless
    // has no timer, so this runs on every incoming update.
    try {
      await runCleanup();
    } catch {
      // Cleanup never breaks handling.
    }
    // The DB group is owner-only: everyone else is ignored there.
    if (isDbGroup(chatId)) {
      if (!isOwner(userId)) return;
      await trackUser(from, null);
      if (text.startsWith('/')) {
        const handled = await handleDbGroupCommand(chatId, messageId, userId, text);
        if (handled !== false) return;
        await showDb(chatId, userId, dbErrorView('این دستور را نمی‌شناسم. /help'));
        return;
      }
      if (await handlePendingCategoryName(chatId, messageId, userId, text)) return;
      if (await handlePendingTitle(chatId, messageId, userId, text)) return;
      if (await handlePendingPriceAmount(chatId, messageId, userId, text)) return;
      if (text) {
        // Plain text with no pending title: nothing to do with it.
        return;
      }
      await handleDbGroupFile(chatId, message, userId);
      return;
    }

    // The receipts group is owner-only: only /rx matters here.
    if (isReceiptsGroup(chatId)) {
      if (!isOwner(userId)) return;
      await trackUser(from, null);
      if (text.startsWith('/')) {
        const handled = await handleReceiptsGroupCommand(chatId, messageId, userId, text);
        if (handled !== false) return;
        await sendExpiring(chatId, 'این دستور را نمی‌شناسم. /rx <شماره پیام> ok|no');
        return;
      }
      return;
    }

    // Any other group: the bot only works in private chat.
    if (chat.type && chat.type !== 'private') return;

    // Private chat.
    await trackUser(from, null);

    // Support: one message (text, photo or file) forwarded to the
    // owner. Runs before the receipt-photo intake so a support photo
    // is not mistaken for a receipt.
    if (await handlePendingSupport(chatId, message, userId, from)) return;
    // Owner answering a support message.
    if (isOwner(userId) && (await handlePendingSupportReply(chatId, message, userId))) return;

    // Receipt photo for a pending top-up (before anything else: a
    // photo is not a command and not a file to download).
    if (message.photo) {
      if (await handleReceiptPhoto(chatId, message, userId, from)) return;
      return;
    }

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
      await deleteMessageBestEffort(chatId, messageId);
      const parts = text.split(/\s+/);
      const command = parts[0].split('@')[0];
      if (command === '/start') {
        if (!(await ensureMember(chatId, userId))) return;
        const all = await listFiles();
        await showPrivate(chatId, userId, mainMenuView(isOwner(userId), all.length, await getUserBalance(userId)));
        return;
      }
      if (command === '/projects') {
        if (!(await ensureMember(chatId, userId))) return;
        await showPrivate(chatId, userId, { text: 'در حال گرفتن پروژه‌ها…' });
        const res = await getProjects(false);
        await showPrivate(chatId, userId, projectsView(res.repos, res.cachedAt, res.liveFailed));
        return;
      }
      if (command === '/socials') {
        if (!(await ensureMember(chatId, userId))) return;
        await showPrivate(chatId, userId, socialsView(SOCIALS));
        return;
      }
      if (command === '/files') {
        if (!(await ensureMember(chatId, userId))) return;
        const all = await listFiles();
        await showPrivate(chatId, userId, categoriesView(await listCategories(), all.length));
        return;
      }
      if (command === '/search') {
        if (!(await ensureMember(chatId, userId))) return;
        await showPrivate(chatId, userId, searchPromptView());
        await setSetting(`pending_search:${userId}`, '1');
        return;
      }
      if (command === '/get') {
        if (!(await ensureMember(chatId, userId))) return;
        const id = parseFileId(parts.slice(1).join(' '));
        if (!id) {
          await showPrivate(chatId, userId, errorView('شناسه فایل را بفرستید. مثال: /get F001'));
          return;
        }
        await showFile(chatId, userId, id, null);
        return;
      }
      if (command === '/wallet') {
        if (!(await ensureMember(chatId, userId))) return;
        await showPrivate(
          chatId,
          userId,
          walletView(await getUserBalance(userId), await listUserTransactions(userId)),
        );
        return;
      }
      if (command === '/stats') {
        if (!isOwner(userId)) {
          await showPrivate(chatId, userId, errorView('این بخش فقط برای صاحب بات است.'));
          return;
        }
        await showStats(chatId, userId);
        return;
      }
      if (command === '/support') {
        if (!(await ensureMember(chatId, userId))) return;
        await setSetting(`pending_support:${userId}`, '1');
        await showPrivate(chatId, userId, supportPromptView());
        return;
      }
      if (command === '/help') {
        await showPrivate(chatId, userId, { text: HELP_TEXT, reply_markup: undefined });
        return;
      }
      await showPrivate(chatId, userId, errorView('این دستور را نمی‌شناسم. /help'));
      return;
    }
    if (await handlePendingSearch(chatId, messageId, userId, text)) return;
    if (await handlePendingChargeAmount(chatId, messageId, userId, text)) return;
    if (await handlePendingUserSearch(chatId, messageId, userId, text)) return;
    if (await handlePendingBroadcast(chatId, messageId, userId, text)) return;
    if (await handlePendingNotifyUser(chatId, messageId, userId, text)) return;
    if (await handlePendingBalance(chatId, messageId, userId, text)) return;
    // A bare id (F001) opens that file.
    const bare = normalizeDigits(text);
    if (/^F\d{1,6}$/i.test(bare)) {
      if (!(await ensureMember(chatId, userId))) return;
      const id = parseFileId(text);
      await showFile(chatId, userId, id, null);
      await deleteMessageBestEffort(chatId, messageId);
      return;
    }
    await showPrivate(
      chatId,
      userId,
      mainMenuView(isOwner(userId), (await listFiles()).length, await getUserBalance(userId)),
    );
    await deleteMessageBestEffort(chatId, messageId);
  } catch (err) {
    try {
      if (isDbGroup(chatId)) {
        await showDb(chatId, userId, dbErrorView('خطایی رخ داد: ' + (err?.message || 'نامشخص')));
      } else if (!isReceiptsGroup(chatId)) {
        await showPrivate(chatId, userId, errorView('خطایی رخ داد: ' + (err?.message || 'نامشخص')));
      }
    } catch {
      // The error reply itself failed; nothing more to do.
    }
  }
}
