// Bot-only message handler (v7). One screen, edited in place: commands
// send a single screen message; buttons edit it; nothing spams. All
// inbox/draft logic lives in lib/inbox.js and lib/views.js — this file
// only routes updates to screens.

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { rss_feeds, drafts } from '../schema.js';
import { isOwner } from '../lib/auth.js';
import { callWorker } from '../lib/worker.js';
import { workerErrorMessage } from '../lib/errors.js';
import { isYouTubeUrl, extractYouTubeUrl, parseTehranDateTime, validateFeedUrl } from '../lib/pure.js';
import { draftPayload } from '../lib/format.js';
import {
  getSetting,
  setSetting,
  deleteSetting,
  getChannel,
} from '../lib/store.js';
import {
  fetchNews,
  inboxMenu,
  listNewItems,
  listDrafts,
  listScheduled,
  listFeeds,
  getDraft,
  getCounts,
} from '../lib/inbox.js';
import {
  HELP_TEXT,
  mainMenuView,
  helpView,
  errorView,
  draftView,
  draftsView,
  scheduledView,
  feedsView,
  promptEditView,
  promptScheduleView,
  promptFeedUrlView,
  promptFeedNameView,
  clearAskView,
  diagView,
} from '../lib/views.js';
import { draftKeyboard } from '../lib/keyboards.js';

async function sendScreen(chatId, view) {
  const sent = await api.sendMessage({
    chat_id: chatId,
    text: view.text,
    ...(view.reply_markup ? { reply_markup: view.reply_markup } : {}),
  });
  return sent?.message_id ?? null;
}

// Edit the screen message; if the edit fails (message deleted), send the
// screen as a new message instead. Used by command flows that first send
// a placeholder message.
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

async function clearPending(ownerId) {
  await deleteSetting(`editing_draft:${ownerId}`);
  await deleteSetting(`editing_draft_msg:${ownerId}`);
  await deleteSetting(`scheduling_draft:${ownerId}`);
  await deleteSetting(`scheduling_draft_msg:${ownerId}`);
  await deleteSetting(`adding_feed:${ownerId}`);
  await deleteSetting(`adding_feed_msg:${ownerId}`);
  await deleteSetting(`adding_feed_url:${ownerId}`);
}

// --- YouTube: link -> draft -> the draft screen (one message). ---

async function handleYouTube(chatId, text) {
  const url = extractYouTubeUrl(text);
  if (!url) {
    await sendScreen(chatId, errorView('لینک یوتیوب معتبر نیست.'));
    return;
  }
  const res = await callWorker('/link/preview?url=' + encodeURIComponent(url), null, 'GET');
  if (!res || res.ok !== true || res.kind !== 'youtube') {
    await sendScreen(
      chatId,
      errorView(workerErrorMessage(res) || 'گرفتن اطلاعات ویدیو ممکن نشد. دوباره تلاش کنید.'),
    );
    return;
  }
  const rows = await db
    .insert(drafts)
    .values({
      kind: 'youtube',
      title: res.title || url,
      body: '',
      media_url: res.thumbnail_url || null,
      source_url: url,
      button_text: 'تماشا در یوتیوب',
      button_url: url,
      news_item_id: null,
      status: 'draft',
      publish_at: null,
      created_at: Date.now(),
    })
    .returning()
    .run();
  const draft = rows && rows[0];
  if (!draft) {
    await sendScreen(chatId, errorView('ساخت پیش‌نویس ممکن نشد.'));
    return;
  }
  await sendScreen(chatId, {
    text:
      `${res.title || url}` +
      (res.author_name ? '\n' + res.author_name : '') +
      '\n\nتوضیح را با دکمه ویرایش بنویسید.',
    reply_markup: draftKeyboard(draft),
  });
}

// --- Pending text input: edit draft / set schedule time. The prompt and
// the result both edit the draft screen message. ---

async function handlePendingEdit(chatId, messageId, ownerId, text) {
  const draftId = await getSetting(`editing_draft:${ownerId}`);
  if (!draftId) return false;
  const stored = parseStoredMessage(await getSetting(`editing_draft_msg:${ownerId}`));
  const draft = await getDraft(draftId);
  await clearPending(ownerId);
  if (!draft) {
    if (stored) {
      await replaceScreen(stored.chatId, stored.messageId, errorView('پیش‌نویس پیدا نشد.'));
    } else {
      await sendScreen(chatId, errorView('پیش‌نویس پیدا نشد.'));
    }
    return true;
  }
  await db.update(drafts).set({ body: text }).where(eq(drafts.id, draft.id)).run();
  const updated = (await getDraft(draft.id)) || { ...draft, body: text };
  if (stored) {
    await replaceScreen(stored.chatId, stored.messageId, draftView(updated));
  } else {
    await sendScreen(chatId, draftView(updated));
  }
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

async function handlePendingSchedule(chatId, messageId, ownerId, text) {
  const draftId = await getSetting(`scheduling_draft:${ownerId}`);
  if (!draftId) return false;
  const stored = parseStoredMessage(await getSetting(`scheduling_draft_msg:${ownerId}`));
  const show = async (view) => {
    if (stored) {
      await replaceScreen(stored.chatId, stored.messageId, view);
    } else {
      await sendScreen(chatId, view);
    }
  };
  const publishAt = parseTehranDateTime(text);
  if (publishAt === null) {
    const draft = await getDraft(draftId);
    await show(promptScheduleView(draft || { id: draftId }, 'زمان معتبر نیست.'));
    return true;
  }
  if (publishAt <= Date.now()) {
    const draft = await getDraft(draftId);
    await show(promptScheduleView(draft || { id: draftId }, 'زمان باید در آینده باشد.'));
    return true;
  }
  const draft = await getDraft(draftId);
  if (!draft) {
    await clearPending(ownerId);
    await show(errorView('پیش‌نویس پیدا نشد.'));
    return true;
  }
  const channel = await getChannel();
  if (!channel) {
    await clearPending(ownerId);
    await show(errorView('کانال تنظیم نشده است. اول بات را در کانال ادمین کنید.'));
    return true;
  }
  const res = await callWorker('/schedule', {
    draft: draftPayload(draft),
    channel_id: Number(channel.id),
    publish_at: publishAt,
  });
  if (!res || res.ok !== true) {
    await show(errorView(workerErrorMessage(res) || 'زمان‌بندی ممکن نشد. دوباره تلاش کنید.'));
    return true;
  }
  await db
    .update(drafts)
    .set({ status: 'scheduled', publish_at: publishAt })
    .where(eq(drafts.id, draft.id))
    .run();
  await clearPending(ownerId);
  const updated = (await getDraft(draft.id)) || { ...draft, status: 'scheduled', publish_at: publishAt };
  await show(draftView(updated));
  await deleteMessageBestEffort(chatId, messageId);
  return true;
}

// --- Pending text input: add-feed flow (URL step, then optional name).
// Same pending-state pattern as edit/schedule: the prompt and the result
// both edit the feeds screen message. ---

async function handlePendingAddFeed(chatId, messageId, ownerId, text) {
  const step = await getSetting(`adding_feed:${ownerId}`);
  if (!step) return false;
  const stored = parseStoredMessage(await getSetting(`adding_feed_msg:${ownerId}`));
  const show = async (view) => {
    if (stored) {
      await replaceScreen(stored.chatId, stored.messageId, view);
    } else {
      await sendScreen(chatId, view);
    }
  };
  if (step === 'url') {
    const checked = validateFeedUrl(text);
    if (!checked.ok) {
      await show(promptFeedUrlView(checked.error + ' دوباره بفرستید.'));
      return true;
    }
    const existing = await db.select().from(rss_feeds).where(eq(rss_feeds.url, checked.url)).get();
    if (existing) {
      await show(promptFeedUrlView('این فید قبلاً اضافه شده است. یک آدرس دیگر بفرستید.'));
      return true;
    }
    await setSetting(`adding_feed:${ownerId}`, 'name');
    await setSetting(`adding_feed_url:${ownerId}`, checked.url);
    await show(promptFeedNameView(checked.url));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  if (step === 'name') {
    const url = await getSetting(`adding_feed_url:${ownerId}`);
    const name = text === '-' || text === 'بدون نام' ? null : text;
    await clearPending(ownerId);
    if (!url) {
      await show(feedsView(await listFeeds()));
      return true;
    }
    const existing = await db.select().from(rss_feeds).where(eq(rss_feeds.url, url)).get();
    if (!existing) {
      await db
        .insert(rss_feeds)
        .values({ url, name, active: 1, created_at: Date.now() })
        .run();
    }
    await show(feedsView(await listFeeds()));
    await deleteMessageBestEffort(chatId, messageId);
    return true;
  }
  return false;
}

// --- /diag: one line per check, with the real error when one fails. ---

async function handleDiag(chatId) {
  const health = await callWorker('/health', {}, 'POST');
  const workerOk = !!health && health.ok === true;
  const secretOk = workerOk;
  const workerError = workerOk ? null : workerErrorMessage(health);
  const secretError = workerOk ? null : 'بررسی نشد — Worker در دسترس نیست.';
  let aiOk = false;
  let aiError = null;
  if (workerOk) {
    const ai = await callWorker('/ai', {
      task: 'write_post',
      title: 'تست تشخیص',
      text: 'این یک متن تست کوتاه است.',
    });
    aiOk = !!ai && ai.ok === true && typeof ai.text === 'string' && ai.text.length > 0;
    if (!aiOk) aiError = workerErrorMessage(ai);
  } else {
    aiError = 'Worker در دسترس نیست، تست AI انجام نشد.';
  }
  const kvOk = workerOk && health.kv === true;
  const kvError = workerOk && health.kv !== true ? 'KV در Worker تنظیم نشده.' : null;
  const channel = await getChannel();
  const counts = await getCounts();
  await sendScreen(
    chatId,
    diagView({ workerOk, workerError, secretOk, secretError, aiOk, aiError, kvOk, kvError, channel, counts }),
  );
}

async function handleAddFeed(chatId, parts) {
  const name = parts.slice(2).join(' ') || null;
  const checked = validateFeedUrl(parts[1] || '');
  if (!checked.ok) {
    await sendScreen(chatId, errorView(checked.error));
    return;
  }
  const existing = await db.select().from(rss_feeds).where(eq(rss_feeds.url, checked.url)).get();
  if (existing) {
    await sendScreen(chatId, errorView('این فید قبلاً اضافه شده است.'));
    return;
  }
  await db
    .insert(rss_feeds)
    .values({ url: checked.url, name, active: 1, created_at: Date.now() })
    .run();
  await sendScreen(chatId, feedsView(await listFeeds()));
}

export default async function (message, ctx) {
  const ownerId = message.from?.id;
  if (!isOwner(ownerId)) return;
  const chatId = message.chat.id;
  const messageId = message.message_id;
  const text = (message.text || '').trim();
  try {
    if (!text) {
      await sendScreen(chatId, errorView('یک دستور یا لینک یوتیوب بفرستید. /help'));
      return;
    }
    if (text.startsWith('/')) {
      await clearPending(ownerId);
      const parts = text.split(/\s+/);
      const command = parts[0].split('@')[0];
      if (command === '/start') {
        await sendScreen(chatId, mainMenuView(await getCounts()));
        return;
      }
      if (command === '/news') {
        const placeholder = await sendScreen(chatId, { text: 'در حال گرفتن خبرها…' });
        const result = await fetchNews();
        if (result.error) {
          await replaceScreen(chatId, placeholder, errorView(result.error));
          return;
        }
        await replaceScreen(chatId, placeholder, await inboxMenu());
        return;
      }
      if (command === '/drafts') {
        await sendScreen(chatId, draftsView(await listDrafts(), 0));
        return;
      }
      if (command === '/scheduled') {
        await sendScreen(chatId, scheduledView(await listScheduled(), 0));
        return;
      }
      if (command === '/feeds') {
        await sendScreen(chatId, feedsView(await listFeeds()));
        return;
      }
      if (command === '/diag') {
        await handleDiag(chatId);
        return;
      }
      if (command === '/clear') {
        const news = await listNewItems();
        const all = await db.select().from(news_items).all();
        const discarded = all.filter((n) => n.status === 'discarded').length;
        await sendScreen(chatId, clearAskView(news.length + discarded));
        return;
      }
      if (command === '/addrss' || command === '/addfeed') {
        await handleAddFeed(chatId, parts);
        return;
      }
      if (command === '/help') {
        await sendScreen(chatId, { text: HELP_TEXT, reply_markup: undefined });
        return;
      }
      await sendScreen(chatId, errorView('این دستور را نمی‌شناسم. /help'));
      return;
    }
    if (await handlePendingEdit(chatId, messageId, ownerId, text)) return;
    if (await handlePendingSchedule(chatId, messageId, ownerId, text)) return;
    if (await handlePendingAddFeed(chatId, messageId, ownerId, text)) return;
    if (isYouTubeUrl(text)) {
      await handleYouTube(chatId, text);
      return;
    }
    await sendScreen(chatId, errorView('متوجه نشدم. /help را بفرستید تا دستورها را ببینید.'));
  } catch (err) {
    try {
      await sendScreen(chatId, errorView('خطایی رخ داد: ' + (err?.message || 'نامشخص')));
    } catch {
      // The error reply itself failed; nothing more to do.
    }
  }
}
