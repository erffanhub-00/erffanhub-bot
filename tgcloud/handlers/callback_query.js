// Callback handler (v1). Every button edits the same screen message
// in place — the only new messages are the delivered files. User
// tracking runs on every interaction. Stats and DB-group actions are
// owner-only; everything else re-checks force-join membership.

import { api } from 'sdk';
import { isOwner } from '../lib/auth.js';
import { SOCIALS } from '../lib/config.js';
import {
  getSetting,
  setSetting,
  deleteSetting,
  trackUser,
  listFiles,
  listCategories,
  getUser,
  getFile,
  deleteFile,
  getUserDownloads,
} from '../lib/store.js';
import { needsPhonePrompt, categoryOptions } from '../lib/pure.js';
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
  mainMenuView,
  helpView,
  errorView,
  joinView,
  projectsView,
  socialsView,
  filesView,
  categoriesView,
  categoryFilesView,
  fileView,
  searchPromptView,
  statsView,
  statsUsersView,
  statsUserView,
  statsFilesView,
  statsFileView,
  promptTitleView,
} from '../lib/views.js';

async function editScreen(chatId, messageId, view) {
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text: view.text,
      ...(view.reply_markup ? { reply_markup: view.reply_markup } : {}),
    });
  } catch {
    // Identical text or a deleted message: nothing to fix.
  }
}

async function sendScreen(chatId, view) {
  const sent = await api.sendMessage({
    chat_id: chatId,
    text: view.text,
    ...(view.reply_markup ? { reply_markup: view.reply_markup } : {}),
  });
  return sent?.message_id ?? null;
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
    // m:check and fl:dl answer with their own toast text later, so the
    // generic answer is skipped for them (a query can only be
    // answered once).
    if (action !== 'm:check' && action !== 'fl:dl') {
      await api.answerCallbackQuery({ callback_query_id: queryId });
      answered = true;
    }

    const show = (view) => editScreen(chatId, messageId, view);
    const showError = (message) => show(errorView(message));

    // --- DB group: delete confirm + cancel pending input (owner only).
    if (isDbGroup(chatId)) {
      if (!isOwner(userId)) return;
      if (action === 'db:dy') {
        const file = await getFile(arg1);
        if (file) await deleteFile(file.id);
        await show({ text: file ? `فایل ${file.id} حذف شد.` : 'فایل پیدا نشد.' });
        return;
      }
      if (action === 'db:dn') {
        await show({ text: 'لغو شد.' });
        return;
      }
      if (action === 'db:cx') {
        await deleteSetting(`pending_title:${userId}`);
        await deleteSetting(`pending_bundle:${userId}`);
        await deleteSetting(`pending_update:${userId}`);
        await deleteSetting(`pending_catname:${userId}`);
        await show({ text: 'لغو شد.' });
        return;
      }
      // Owner picks a category for the pending ingest.
      if (action === 'db:cat') {
        const raw = await getSetting(`pending_title:${userId}`);
        if (!raw) {
          await show({ text: 'فایلی در انتظار نیست.' });
          return;
        }
        const names = categoryOptions(await listFiles());
        const name = names[num(arg1)];
        if (!name) return;
        const state = JSON.parse(raw);
        state.category = name;
        await setSetting(`pending_title:${userId}`, JSON.stringify(state));
        await show(promptTitleView(names, name, state.mode === 'bundle'));
        return;
      }
      // Owner wants a brand-new category: ask for its name as text.
      if (action === 'db:catnew') {
        const raw = await getSetting(`pending_title:${userId}`);
        if (!raw) {
          await show({ text: 'فایلی در انتظار نیست.' });
          return;
        }
        await setSetting(`pending_catname:${userId}`, raw);
        await show({ text: 'نام دسته جدید را بفرستید (یا «لغو» برای برگشت).' });
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
    if (needsGate && chatId && !isDbGroup(chatId)) {
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
      await show(mainMenuView(isOwner(userId), all.length));
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
        await show(mainMenuView(isOwner(userId), all.length));
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
      await setSetting(`pending_search:${userId}`, `${chatId}:${messageId}`);
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
      await show(mainMenuView(isOwner(userId), all.length));
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
      await show(fileView(model.view, model.parts, model.versions, count));
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
      await show(fileView(model.view, model.parts, model.versions, count));
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
      } else if (chatId && messageId) {
        await editScreen(chatId, messageId, errorView('خطایی رخ داد: ' + (err?.message || 'نامشخص')));
      }
    } catch {
      // The fallback itself failed; nothing more to do.
    }
  }
}
