// Callback handler (v2.1). Every button deletes the tapped screen
// message and sends a fresh one at the bottom of the chat — the only
// new messages are the delivered files (which delete themselves after
// 60s), the owner's support replies and the backup file. Expired
// self-deleting messages are swept on every update (see
// lib/library.js runCleanup). User tracking runs on every
// interaction. Stats, receipts and DB-group actions are owner-only;
// everything else re-checks force-join membership.

import { api, InputFile } from 'sdk';
import { isOwner } from '../lib/auth.js';
import { SOCIALS, CARD_NUMBER } from '../lib/config.js';
import {
  getSetting,
  setSetting,
  deleteSetting,
  trackUser,
  takeNextFileId,
  listFiles,
  listCategories,
  getUser,
  getFile,
  deleteFile,
  getUserDownloads,
  getUserBalance,
  listUserTransactions,
  listTransactions,
  getTransactionByReceiptMessage,
  finalizeIngest,
  getDbCounts,
  exportDatabase,
  clearDownloads,
  clearGithubCache,
} from '../lib/store.js';
import { needsPhonePrompt, categoryOptions, isPremiumFile, canAfford } from '../lib/pure.js';
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
  receiptApprovedText,
  runCleanup,
  sendNotifyToUsers,
  getFileDownloaders,
} from '../lib/library.js';
import { confirmKeyboard } from '../lib/keyboards.js';
import { getProjects } from '../lib/github.js';
import {
  mainMenuView,
  helpView,
  errorView,
  dbErrorView,
  joinView,
  projectsView,
  socialsView,
  filesView,
  categoriesView,
  categoryFilesView,
  fileView,
  searchPromptView,
  walletView,
  chargeView,
  chargeAmountView,
  chargeCustomAmountView,
  premiumPayView,
  myTxView,
  statsView,
  statsUsersView,
  statsUserView,
  statsFilesView,
  statsFileView,
  ownerTxView,
  userSearchPromptView,
  userSearchResultsView,
  notifyPromptView,
  notifyConfirmView,
  notifyAudienceView,
  notifyFilePickerView,
  notifyUserPromptView,
  supportPromptView,
  balancePromptView,
  dbView,
  promptTitleView,
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
// a fresh message at the bottom of the chat and remember it.
async function showScreen(chatId, view, key) {
  if (key) await deleteStoredScreen(key);
  const sent = await api.sendMessage({
    chat_id: chatId,
    text: view.text,
    ...(view.reply_markup ? { reply_markup: view.reply_markup } : {}),
  });
  const id = sent?.message_id ?? null;
  if (key && id) await setSetting(key, `${chatId}:${id}`);
  return id;
}

async function editMessageCaptionBestEffort(chatId, messageId, caption) {
  try {
    await api.editMessageCaption({ chat_id: chatId, message_id: messageId, caption });
  } catch {
    // Cosmetic only.
  }
}

async function removeInlineKeyboardBestEffort(chatId, messageId) {
  try {
    await api.editMessageReplyMarkup({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    // The receipt is already decided (idempotent); stale buttons
    // answer with "already decided".
  }
}

// (deliverParts lives in lib/library.js — shared with message.js,
// which delivers a file after the optional phone prompt.)

export default async function (query, ctx) {
  const from = query.from || {};
  const userId = from.id;
  const queryId = query.id;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const data = String(query.data || '');
  const parts = data.split(':');
  const action = parts[0] + ':' + (parts[1] || '');
  const arg1 = parts[2];
  const arg2 = parts[3];
  const num = (v) => Number(v) || 0;

  let answered = false;
  try {
    await trackUser(from, null);
    // Sweep self-deleting messages whose time has come.
    try {
      await runCleanup();
    } catch {
      // Cleanup never breaks handling.
    }
    // m:check and fl:dl answer with their own toast text later, so the
    // generic answer is skipped for them (a query can only be
    // answered once).
    if (action !== 'm:check' && action !== 'fl:dl') {
      await api.answerCallbackQuery({ callback_query_id: queryId });
      answered = true;
    }

    const show = (view) => showScreen(chatId, view, screenKey(userId));
    const showDb = (view) => showScreen(chatId, view, screenDbKey(userId));
    const showError = (message) => show(errorView(message));

    // --- Receipts group: approve / reject a top-up (owner only). ---
    if (isReceiptsGroup(chatId)) {
      if (!isOwner(userId)) return;
      if (action === 'rx:ok' || action === 'rx:no') {
        const mid = num(arg1);
        const tx = await getTransactionByReceiptMessage(mid);
        const res = await settleReceipt(tx, action === 'rx:ok');
        if (res.status === 'missing') {
          await api.answerCallbackQuery({ callback_query_id: queryId, text: 'رسیدی پیدا نشد.' });
          return;
        }
        if (res.status === 'already') {
          await api.answerCallbackQuery({ callback_query_id: queryId, text: 'قبلاً بررسی شده است.' });
          return;
        }
        if (res.status === 'approved') {
          await editMessageCaptionBestEffort(
            chatId,
            messageId,
            receiptApprovedText(tx, await getUser(tx.user_id)),
          );
          await removeInlineKeyboardBestEffort(chatId, messageId);
          await api.answerCallbackQuery({ callback_query_id: queryId, text: 'تایید شد.' });
          return;
        }
        // Rejected receipts are deleted from the receipts group.
        await deleteMessageBestEffort(chatId, messageId);
        await api.answerCallbackQuery({ callback_query_id: queryId, text: 'رد شد.' });
        return;
      }
      return;
    }

    // --- DB group: delete confirm + cancel pending input + price
    // choice + file browsing (owner only). ---
    if (isDbGroup(chatId)) {
      if (!isOwner(userId)) return;
      if (action === 'db:dy') {
        const file = await getFile(arg1);
        if (file) await deleteFile(file.id);
        await showDb({ text: file ? `فایل ${file.id} حذف شد.` : 'فایل پیدا نشد.' });
        return;
      }
      if (action === 'db:dn') {
        await showDb({ text: 'لغو شد.' });
        return;
      }
      if (action === 'db:cx') {
        await deleteSetting(`pending_title:${userId}`);
        await deleteSetting(`pending_bundle:${userId}`);
        await deleteSetting(`pending_update:${userId}`);
        await deleteSetting(`pending_catname:${userId}`);
        await deleteSetting(`pending_price:${userId}`);
        await deleteSetting(`pending_price_amount:${userId}`);
        await showDb({ text: 'لغو شد.' });
        return;
      }
      // Owner picks a category for the pending ingest.
      if (action === 'db:cat') {
        const raw = await getSetting(`pending_title:${userId}`);
        if (!raw) {
          await showDb({ text: 'فایلی در انتظار نیست.' });
          return;
        }
        const names = categoryOptions(await listFiles());
        const name = names[num(arg1)];
        if (!name) return;
        const state = JSON.parse(raw);
        state.category = name;
        await setSetting(`pending_title:${userId}`, JSON.stringify(state));
        await showDb(promptTitleView(names, name, state.mode === 'bundle'));
        return;
      }
      // Owner wants a brand-new category: ask for its name as text.
      if (action === 'db:catnew') {
        const raw = await getSetting(`pending_title:${userId}`);
        if (!raw) {
          await showDb({ text: 'فایلی در انتظار نیست.' });
          return;
        }
        await setSetting(`pending_catname:${userId}`, raw);
        await showDb({ text: 'نام دسته جدید را بفرستید (یا «لغو» برای برگشت).' });
        return;
      }
      // Owner picks free for the pending ingest.
      if (action === 'db:free') {
        const raw = await getSetting(`pending_price:${userId}`);
        if (!raw) {
          await showDb(dbErrorView('فایلی در انتظار قیمت نیست.'));
          return;
        }
        const state = JSON.parse(raw);
        await deleteSetting(`pending_price:${userId}`);
        const id = await takeNextFileId();
        const done = await finalizeIngest(state, id, state.title, state.description, 0);
        if (done) {
          await showDb(titleSavedView(done));
        } else {
          await showDb(dbErrorView('ثبت فایل ممکن نشد.'));
        }
        return;
      }
      // Owner picks premium: ask for the price as text.
      if (action === 'db:prem') {
        const raw = await getSetting(`pending_price:${userId}`);
        if (!raw) {
          await showDb(dbErrorView('فایلی در انتظار قیمت نیست.'));
          return;
        }
        await setSetting(`pending_price_amount:${userId}`, raw);
        await deleteSetting(`pending_price:${userId}`);
        await showDb(priceAmountPromptView());
        return;
      }
      // Close a DB-group screen.
      if (action === 'db:cls' || action === 'm:home') {
        await deleteMessageBestEffort(chatId, messageId);
        await deleteSetting(screenDbKey(userId));
        return;
      }
      // File browsing inside the DB group (same lists as users see).
      if (action === 'm:files') {
        const all = await listFiles();
        await showDb(categoriesView(await listCategories(), all.length));
        return;
      }
      if (action === 'fl:cat') {
        const cats = await listCategories();
        const cat = cats[num(arg1)];
        if (!cat) {
          const all = await listFiles();
          await showDb(categoriesView(cats, all.length));
          return;
        }
        const items = (await listFiles()).filter((f) => (f.category || 'سایر') === cat.name);
        await showDb(categoryFilesView(items, 0, num(arg1), cat.name));
        return;
      }
      if (action === 'fc:pg') {
        const cats = await listCategories();
        const cat = cats[num(arg1)];
        if (!cat) {
          const all = await listFiles();
          await showDb(categoriesView(cats, all.length));
          return;
        }
        const items = (await listFiles()).filter((f) => (f.category || 'سایر') === cat.name);
        await showDb(categoryFilesView(items, num(arg2), num(arg1), cat.name));
        return;
      }
      if (action === 'fl:all') {
        await showDb(filesView(await listFiles(), 0, null, 'db:cls', true));
        return;
      }
      if (action === 'fl:pg') {
        await showDb(filesView(await listFiles(), num(arg1), null, 'db:cls', true));
        return;
      }
      if (action === 'fl:vw' || action === 'fl:ver') {
        const model = await getFileViewModel(arg1, action === 'fl:ver' ? num(arg2) : null);
        if (!model) {
          const all = await listFiles();
          await showDb(categoriesView(await listCategories(), all.length));
          return;
        }
        const count = await countDownloads(arg1, model.view.version);
        await showDb(fileView(model.view, model.parts, model.versions, count, 0, { db: true }));
        return;
      }
      if (action === 'fl:dl') {
        // Owner preview in the DB group: free, no phone prompt.
        const model = await getFileViewModel(arg1, num(arg2));
        if (!model) {
          await api.answerCallbackQuery({ callback_query_id: queryId });
          answered = true;
          await showDb(dbErrorView('فایل پیدا نشد.'));
          return;
        }
        const done = await deliverParts(chatId, model.view, model.view.version, model.parts, from, false);
        if (done.error) {
          await api.answerCallbackQuery({ callback_query_id: queryId });
          answered = true;
          await showDb(dbErrorView(done.error));
          return;
        }
        await api.answerCallbackQuery({ callback_query_id: queryId, text: 'فرستاده شد.' });
        answered = true;
        return;
      }
      return;
    }

    // --- Force-join gate for content actions (private chat). ---
    const needsGate = !(
      action === 'm:check' ||
      action === 'sr:cx' ||
      action === 'db:dy' ||
      action === 'db:dn' ||
      action === 'db:cx'
    );
    if (needsGate && chatId && !isDbGroup(chatId) && !isReceiptsGroup(chatId)) {
      const check = await checkMembership(userId);
      if (!membershipPassed(check)) {
        await trackUser(from, false);
        await show(joinView(missingMembership(check)));
        return;
      }
      await trackUser(from, true);
    }

    // --- Main menu ---
    if (action === 'm:home') {
      const all = await listFiles();
      await show(mainMenuView(isOwner(userId), all.length, await getUserBalance(userId)));
      return;
    }
    if (action === 'm:check') {
      const check = await checkMembership(userId);
      if (membershipPassed(check)) {
        await trackUser(from, true);
        await api.answerCallbackQuery({
          callback_query_id: queryId,
          text: 'عضویت تایید شد.',
        });
        answered = true;
        const all = await listFiles();
        await show(mainMenuView(isOwner(userId), all.length, await getUserBalance(userId)));
      } else {
        await trackUser(from, false);
        await api.answerCallbackQuery({
          callback_query_id: queryId,
          text: 'هنوز عضو نشدی.',
        });
        answered = true;
        await show(joinView(missingMembership(check)));
      }
      return;
    }
    if (action === 'm:projects') {
      await show({ text: 'در حال گرفتن پروژه‌ها…' });
      const res = await getProjects(false);
      await show(projectsView(res.repos, res.cachedAt, res.liveFailed));
      return;
    }
    if (action === 'gh:ref') {
      await show({ text: 'در حال گرفتن پروژه‌ها…' });
      const res = await getProjects(true);
      await show(projectsView(res.repos, res.cachedAt, res.liveFailed));
      return;
    }
    if (action === 'm:socials') {
      await show(socialsView(SOCIALS));
      return;
    }
    if (action === 'm:files') {
      const all = await listFiles();
      await show(categoriesView(await listCategories(), all.length));
      return;
    }
    if (action === 'm:search') {
      await setSetting(`pending_search:${userId}`, '1');
      await show(searchPromptView());
      return;
    }
    if (action === 'm:help') {
      await show(helpView());
      return;
    }
    if (action === 'sr:cx') {
      await deleteSetting(`pending_search:${userId}`);
      await deleteSetting(`search_query:${userId}`);
      const all = await listFiles();
      await show(mainMenuView(isOwner(userId), all.length, await getUserBalance(userId)));
      return;
    }

    // --- Support: the user writes one message for the owner. ---
    if (action === 'm:support') {
      await setSetting(`pending_support:${userId}`, '1');
      await show(supportPromptView());
      return;
    }
    if (action === 'sp:cx') {
      await deleteSetting(`pending_support:${userId}`);
      const all = await listFiles();
      await show(mainMenuView(isOwner(userId), all.length, await getUserBalance(userId)));
      return;
    }
    // Owner taps "reply" on a support message.
    if (action === 'sp:rep') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      const target = await getUser(arg1);
      if (!target) {
        await showError('کاربر پیدا نشد.');
        return;
      }
      await setSetting(
        `pending_support_reply:${userId}`,
        JSON.stringify({ userId: target.user_id }),
      );
      await show(notifyUserPromptView(target));
      return;
    }

    // --- Wallet ---
    if (action === 'w:home') {
      await show(walletView(await getUserBalance(userId), await listUserTransactions(userId)));
      return;
    }
    if (action === 'w:charge') {
      await show(chargeView(CARD_NUMBER));
      return;
    }
    if (action === 'w:amt') {
      const amount = num(arg1);
      if (amount <= 0) {
        await showError('مبلغ درست نیست.');
        return;
      }
      await setSetting(`pending_charge_receipt:${userId}`, JSON.stringify({ amount }));
      await show(chargeAmountView(amount));
      return;
    }
    if (action === 'w:amtc') {
      await setSetting(`pending_charge_amount:${userId}`, '1');
      await show(chargeCustomAmountView());
      return;
    }
    if (action === 'w:tx') {
      await show(myTxView(await listUserTransactions(userId), num(arg1)));
      return;
    }
    if (action === 'w:cx') {
      await deleteSetting(`pending_charge_receipt:${userId}`);
      await deleteSetting(`pending_charge_amount:${userId}`);
      await show(walletView(await getUserBalance(userId), await listUserTransactions(userId)));
      return;
    }

    // --- Owner stats ---
    if (action === 'm:stats' || action === 'st:home') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await show(statsView(await getStatsData()));
      return;
    }
    if (action === 'st:users') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await show(statsUsersView(await getStatsUsers(), num(arg1)));
      return;
    }
    if (action === 'st:files') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      const s = await getStatsData();
      await show(statsFilesView(s.files, num(arg1), s.perFile));
      return;
    }
    if (action === 'st:u') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      const allUsers = await getStatsUsers();
      const user = allUsers.find((u) => String(u.user_id) === String(arg1));
      if (!user) {
        await show(statsUsersView(allUsers, 0));
        return;
      }
      const history = await getUserDownloads(user.user_id);
      await show(statsUserView(user, history));
      return;
    }
    if (action === 'st:f') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      const model = await getFileViewModel(arg1, null);
      if (!model) {
        const s = await getStatsData();
        await show(statsFilesView(s.files, 0, s.perFile));
        return;
      }
      const count = await countDownloads(arg1, model.view.version);
      await show(statsFileView(model.view, model.parts, model.versions, count));
      return;
    }
    if (action === 'st:usearch') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await setSetting(`pending_usersearch:${userId}`, '1');
      await show(userSearchPromptView());
      return;
    }
    if (action === 'st:usx') {
      await deleteSetting(`pending_usersearch:${userId}`);
      await deleteSetting(`user_search_query:${userId}`);
      const ret = (await getSetting(`pending_notify_return:${userId}`)) || 'stats';
      await deleteSetting(`pending_notify_return:${userId}`);
      if (ret === 'menu') {
        await show(notifyAudienceView());
      } else {
        await show(statsView(await getStatsData()));
      }
      return;
    }
    if (action === 'st:ures') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      const q = (await getSetting(`user_search_query:${userId}`)) || '';
      const results = q ? await searchStatsUsers(q) : [];
      await show(userSearchResultsView(results, num(arg1), q));
      return;
    }
    if (action === 'st:tx') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await show(ownerTxView(await listTransactions(), num(arg1)));
      return;
    }
    if (action === 'st:msg') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      const target = await getUser(arg1);
      if (!target) {
        await showError('کاربر پیدا نشد.');
        return;
      }
      await setSetting(`pending_notify_user:${userId}`, JSON.stringify({ userId: target.user_id }));
      await show(notifyUserPromptView(target));
      return;
    }
    if (action === 'st:notify') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await setSetting(`pending_broadcast:${userId}`, '1');
      await setSetting(`pending_notify_return:${userId}`, 'stats');
      await deleteSetting(`pending_notify_file:${userId}`);
      await show(notifyPromptView('', 'همه کاربران'));
      return;
    }
    if (action === 'st:nfx') {
      await deleteSetting(`pending_broadcast:${userId}`);
      await deleteSetting(`pending_broadcast_text:${userId}`);
      await deleteSetting(`pending_notify_file:${userId}`);
      const ret = (await getSetting(`pending_notify_return:${userId}`)) || 'stats';
      await deleteSetting(`pending_notify_return:${userId}`);
      if (ret === 'menu') {
        await show(notifyAudienceView());
      } else {
        await show(statsView(await getStatsData()));
      }
      return;
    }
    if (action === 'st:nfy') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      const text = (await getSetting(`pending_broadcast_text:${userId}`)) || '';
      const fileId = await getSetting(`pending_notify_file:${userId}`);
      const ret = (await getSetting(`pending_notify_return:${userId}`)) || 'stats';
      await deleteSetting(`pending_broadcast:${userId}`);
      await deleteSetting(`pending_broadcast_text:${userId}`);
      await deleteSetting(`pending_notify_file:${userId}`);
      await deleteSetting(`pending_notify_return:${userId}`);
      if (arg1 !== 'yes' || !text) {
        if (ret === 'menu') {
          await show(notifyAudienceView());
        } else {
          await show(statsView(await getStatsData()));
        }
        return;
      }
      const targets = fileId
        ? await getFileDownloaders(fileId)
        : (await getStatsUsers()).map((u) => u.user_id);
      const res = await sendNotifyToUsers(targets, text);
      const audience = fileId ? `کاربران فایل ${fileId}` : 'همه کاربران';
      await show({
        text: `اطلاع‌رسانی به ${audience} ارسال شد.\nبه ${res.ok} کاربر رسید، ${res.fail} کاربر نشد.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '◀ بازگشت', callback_data: ret === 'menu' ? 'm:notify' : 'm:stats' }],
            [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
          ],
        },
      });
      return;
    }

    // --- Notify (owner, from the main menu): pick the audience first. ---
    if (action === 'm:notify') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await show(notifyAudienceView());
      return;
    }
    if (action === 'nf:all') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await setSetting(`pending_broadcast:${userId}`, '1');
      await setSetting(`pending_notify_return:${userId}`, 'menu');
      await deleteSetting(`pending_notify_file:${userId}`);
      await show(notifyPromptView('', 'همه کاربران'));
      return;
    }
    if (action === 'nf:file') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await show(notifyFilePickerView(await listFiles(), 0));
      return;
    }
    if (action === 'nf:fpk') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await show(notifyFilePickerView(await listFiles(), num(arg1)));
      return;
    }
    if (action === 'nf:fpick') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      const file = await getFile(arg1);
      if (!file) {
        await show(notifyFilePickerView(await listFiles(), 0));
        return;
      }
      await setSetting(`pending_notify_file:${userId}`, file.id);
      await setSetting(`pending_broadcast:${userId}`, '1');
      await setSetting(`pending_notify_return:${userId}`, 'menu');
      await show(notifyPromptView('', `کاربران فایل ${file.id}`));
      return;
    }
    if (action === 'nf:user') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await setSetting(`pending_usersearch:${userId}`, '1');
      await setSetting(`pending_notify_return:${userId}`, 'menu');
      await show(userSearchPromptView());
      return;
    }

    // --- Owner admin: manual balance fix + database management. ---
    if (action === 'st:bal') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      const target = await getUser(arg1);
      if (!target) {
        await showError('کاربر پیدا نشد.');
        return;
      }
      await setSetting(
        `pending_balance:${userId}`,
        JSON.stringify({ userId: target.user_id }),
      );
      await show(balancePromptView(target));
      return;
    }
    if (action === 'st:db') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      await show(dbView(await getDbCounts()));
      return;
    }
    if (action === 'st:backup') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      try {
        const dump = await exportDatabase();
        const bytes = new TextEncoder().encode(JSON.stringify(dump, null, 2));
        const stamp = new Date().toISOString().slice(0, 10);
        await api.sendDocument({
          chat_id: chatId,
          document: new InputFile(bytes, `erffanhub-backup-${stamp}.json`, {
            type: 'application/json',
          }),
          caption: 'پشتیبان دیتابیس — همه جدول‌ها.',
        });
      } catch {
        await showError('ارسال پشتیبان ممکن نشد.');
      }
      return;
    }
    if (action === 'st:cleardl') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      if (arg1 === 'yes') {
        await clearDownloads();
        await show(dbView(await getDbCounts()));
        return;
      }
      await show({
        text: 'تاریخچه دانلودها پاک شود؟\nفایل‌ها، کاربران و کیف پول دست نمی‌خورند — فقط اینکه چه کسی چه فایلی را دانلود کرده پاک می‌شود.',
        reply_markup: confirmKeyboard('st:cleardl:yes', 'st:db'),
      });
      return;
    }
    if (action === 'st:clearcache') {
      if (!isOwner(userId)) {
        await showError('این بخش فقط برای صاحب بات است.');
        return;
      }
      if (arg1 === 'yes') {
        await clearGithubCache();
        await show(dbView(await getDbCounts()));
        return;
      }
      await show({
        text: 'کش گیت‌هاب پاک شود؟\nدفعه بعد که پروژه‌ها را باز کنید، لیست دوباره از گیت‌هاب گرفته می‌شود.',
        reply_markup: confirmKeyboard('st:clearcache:yes', 'st:db'),
      });
      return;
    }

    // --- Files: categories / browse / search pages / view / version / download ---
    if (action === 'fl:cat') {
      const cats = await listCategories();
      const cat = cats[num(arg1)];
      if (!cat) {
        const all = await listFiles();
        await show(categoriesView(cats, all.length));
        return;
      }
      const items = (await listFiles()).filter((f) => (f.category || 'سایر') === cat.name);
      await show(categoryFilesView(items, 0, num(arg1), cat.name));
      return;
    }
    if (action === 'fc:pg') {
      const cats = await listCategories();
      const cat = cats[num(arg1)];
      if (!cat) {
        const all = await listFiles();
        await show(categoriesView(cats, all.length));
        return;
      }
      const items = (await listFiles()).filter((f) => (f.category || 'سایر') === cat.name);
      await show(categoryFilesView(items, num(arg2), num(arg1), cat.name));
      return;
    }
    if (action === 'fl:all') {
      await show(filesView(await listFiles(), 0, null, 'm:files'));
      return;
    }
    if (action === 'fl:pg') {
      await show(filesView(await listFiles(), num(arg1), null, 'm:files'));
      return;
    }
    if (action === 'sr:pg') {
      const q = (await getSetting(`search_query:${userId}`)) || '';
      const results = q ? await searchLibrary(q) : [];
      await show(filesView(results, num(arg1), q));
      return;
    }
    if (action === 'fl:vw') {
      const model = await getFileViewModel(arg1, null);
      if (!model) {
        const all = await listFiles();
        await show(categoriesView(await listCategories(), all.length));
        return;
      }
      const count = await countDownloads(arg1, model.view.version);
      await show(fileView(model.view, model.parts, model.versions, count, await getUserBalance(userId)));
      return;
    }
    if (action === 'fl:ver') {
      const model = await getFileViewModel(arg1, num(arg2));
      if (!model) {
        const all = await listFiles();
        await show(categoriesView(await listCategories(), all.length));
        return;
      }
      const count = await countDownloads(arg1, model.view.version);
      await show(fileView(model.view, model.parts, model.versions, count, await getUserBalance(userId)));
      return;
    }
    if (action === 'fl:dl') {
      const model = await getFileViewModel(arg1, num(arg2));
      if (!model) {
        await api.answerCallbackQuery({ callback_query_id: queryId });
        answered = true;
        await showError('فایل پیدا نشد.');
        return;
      }
      // Premium: the wallet must cover the price before anything else.
      if (isPremiumFile(model.view)) {
        const balance = await getUserBalance(userId);
        if (!canAfford(balance, Number(model.view.price) || 0)) {
          await setSetting(
            `pending_purchase:${userId}`,
            JSON.stringify({ fileId: arg1, version: model.view.version }),
          );
          await api.answerCallbackQuery({ callback_query_id: queryId });
          answered = true;
          await show(premiumPayView(model.view, balance));
          return;
        }
      }
      // Optional phone, once: if the user has never shared a phone,
      // offer the native share-contact button + a skip button. The
      // file is delivered either way — this never blocks delivery.
      const userRow = await getUser(userId);
      if (needsPhonePrompt(userRow)) {
        await setSetting(
          `pending_delivery:${userId}`,
          JSON.stringify({ fileId: arg1, version: model.view.version }),
        );
        await api.sendMessage({
          chat_id: chatId,
          text:
            'اگر دوست داری شماره‌ات را هم برای من بفرستی، دکمه زیر را بزن — کاملاً اختیاری است.\n' +
            'اگر نمی‌خواهی، «ادامه بدون شماره» را بزن. فایل در هر صورت فرستاده می‌شود.',
          reply_markup: {
            keyboard: [
              [{ text: '📱 ارسال شماره تلفن (اختیاری)', request_contact: true }],
              [{ text: 'ادامه بدون شماره' }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
        await api.answerCallbackQuery({ callback_query_id: queryId });
        answered = true;
        return;
      }
      // Pay now (free files skip this), then deliver.
      if (isPremiumFile(model.view)) {
        const bought = await purchaseFile(from, model.view, model.view.version);
        if (bought.error) {
          await setSetting(
            `pending_purchase:${userId}`,
            JSON.stringify({ fileId: arg1, version: model.view.version }),
          );
          await api.answerCallbackQuery({ callback_query_id: queryId });
          answered = true;
          await show(premiumPayView(model.view, bought.balance));
          return;
        }
      }
      const done = await deliverParts(chatId, model.view, model.view.version, model.parts, from, false);
      if (done.error) {
        await api.answerCallbackQuery({ callback_query_id: queryId });
        answered = true;
        await showError(done.error);
        return;
      }
      await api.answerCallbackQuery({
        callback_query_id: queryId,
        text: 'فرستاده شد.',
      });
      answered = true;
      return;
    }
  } catch (err) {
    try {
      if (!answered) {
        await api.answerCallbackQuery({
          callback_query_id: queryId,
          text: 'خطایی رخ داد.',
        });
      } else if (chatId && messageId && !isReceiptsGroup(chatId)) {
        const key = isDbGroup(chatId) ? screenDbKey(userId) : screenKey(userId);
        const view = isDbGroup(chatId)
          ? dbErrorView('خطایی رخ داد: ' + (err?.message || 'نامشخص'))
          : errorView('خطایی رخ داد: ' + (err?.message || 'نامشخص'));
        await showScreen(chatId, view, key);
      }
    } catch {
      // The fallback itself failed; nothing more to do.
    }
  }
}
