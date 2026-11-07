// Bot-only callback handler (v6). Every button edits the same screen
// message in place — nothing new is sent, except the one confirmation
// edit. All data comes from lib/inbox.js and lib/views.js.

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { news_items, drafts, rss_feeds } from '../schema.js';
import { isOwner } from '../lib/auth.js';
import { callWorker } from '../lib/worker.js';
import { workerErrorMessage } from '../lib/errors.js';
import { draftPayload, channelMessageLink } from '../lib/format.js';
import { setSetting, deleteSetting, getChannel } from '../lib/store.js';
import {
  fetchNews,
  listNewItems,
  listDrafts,
  listScheduled,
  listFeeds,
  getNewsItem,
  getDraft,
  getFeed,
  getCounts,
} from '../lib/inbox.js';
import {
  mainMenuView,
  helpView,
  errorView,
  inboxView,
  itemView,
  draftView,
  confirmPublishView,
  draftsView,
  scheduledView,
  feedsView,
  promptEditView,
  promptScheduleView,
} from '../lib/views.js';

// Edit the screen message. An edit that fails (e.g. identical text) is
// ignored — the screen already shows what it should.
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

// Error screen with a "back" button instead of the main-menu button.
function errorWithBack(message, backData) {
  return {
    text: message,
    reply_markup: {
      inline_keyboard: [[{ text: 'بازگشت', callback_data: backData }]],
    },
  };
}

async function feedNameFor(item) {
  if (!item?.feed_id) return null;
  const feed = await getFeed(item.feed_id);
  return feed?.name || feed?.url || null;
}

// Build a draft from a news item with the AI writer.
// Returns { draft } or { error } (Persian, with the real reason).
async function makeDraftFromNews(item) {
  const res = await callWorker('/ai', {
    task: 'write_post',
    title: item.title,
    text: item.description || '',
    source_url: item.link,
  });
  if (!res || res.ok !== true || typeof res.text !== 'string') {
    return { error: workerErrorMessage(res) || 'نوشتن پست با AI ممکن نشد.' };
  }
  const rows = await db
    .insert(drafts)
    .values({
      kind: 'news',
      title: item.title,
      body: res.text,
      media_url: null,
      source_url: item.link,
      button_text: 'مشاهده خبر',
      button_url: item.link,
      news_item_id: item.id,
      status: 'draft',
      publish_at: null,
      created_at: Date.now(),
    })
    .returning()
    .run();
  if (!rows || !rows[0]) return { error: 'ساخت پیش‌نویس ممکن نشد.' };
  await db
    .update(news_items)
    .set({ status: 'selected' })
    .where(eq(news_items.id, item.id))
    .run();
  return { draft: rows[0] };
}

// Publish a draft now. Returns { messageId } or { error }.
async function publishDraftNow(draft) {
  const channel = await getChannel();
  if (!channel) {
    return { error: 'کانال تنظیم نشده است. اول بات را در کانال ادمین کنید.' };
  }
  const res = await callWorker('/publish', {
    draft: draftPayload(draft),
    channel_id: Number(channel.id),
  });
  if (!res || res.ok !== true || !res.message_id) {
    return { error: workerErrorMessage(res) || 'انتشار ممکن نشد. پیش‌نویس دست نخورده باقی ماند.' };
  }
  await db.update(drafts).set({ status: 'published' }).where(eq(drafts.id, draft.id)).run();
  return { messageId: res.message_id, channelId: channel.id };
}

// Cancel a scheduled draft on the Worker and in the DB.
// Returns { ok } or { error }.
async function cancelSchedule(draft) {
  const res = await callWorker('/schedule/cancel', { draft_id: draft.id });
  if (!res || res.ok !== true) {
    return { error: workerErrorMessage(res) || 'لغو زمان‌بندی ممکن نشد.' };
  }
  await db
    .update(drafts)
    .set({ status: 'draft', publish_at: null })
    .where(eq(drafts.id, draft.id))
    .run();
  return { ok: true };
}

export default async function (query, ctx) {
  const ownerId = query.from?.id;
  const queryId = query.id;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!isOwner(ownerId)) {
    try {
      await api.answerCallbackQuery({ callback_query_id: queryId });
    } catch {
      // Silent for non-owners; nothing more to do.
    }
    return;
  }
  let answered = false;
  try {
    await api.answerCallbackQuery({ callback_query_id: queryId });
    answered = true;
    const parts = String(query.data || '').split(':');
    const action = parts[0] + ':' + (parts[1] || '');
    const arg1 = parts[2];
    const arg2 = parts[3];
    const num = (v) => Number(v) || 0;

    const show = (view) => editScreen(chatId, messageId, view);
    const showError = (message) => show(errorView(message));

    // --- Main menu ---
    if (action === 'm:home') {
      await show(mainMenuView(await getCounts()));
      return;
    }
    if (action === 'm:in') {
      await show(inboxView(await listNewItems(), 0));
      return;
    }
    if (action === 'm:dr') {
      await show(draftsView(await listDrafts(), 0));
      return;
    }
    if (action === 'm:sc') {
      await show(scheduledView(await listScheduled(), 0));
      return;
    }
    if (action === 'm:fd') {
      await show(feedsView(await listFeeds()));
      return;
    }
    if (action === 'm:help') {
      await show(helpView());
      return;
    }

    // --- Inbox ---
    if (action === 'n:pg') {
      await show(inboxView(await listNewItems(), num(arg1)));
      return;
    }
    if (action === 'n:bk') {
      await show(inboxView(await listNewItems(), num(arg1)));
      return;
    }
    if (action === 'n:ft') {
      await show({ text: 'در حال گرفتن خبرها…' });
      const result = await fetchNews();
      if (result.error) {
        await show(errorView(result.error));
        return;
      }
      await show(inboxView(await listNewItems(), 0));
      return;
    }
    if (action === 'n:it') {
      const item = await getNewsItem(arg1);
      if (!item) {
        await show(inboxView(await listNewItems(), num(arg2)));
        return;
      }
      await show(itemView(item, await feedNameFor(item), num(arg2)));
      return;
    }
    if (action === 'n:mk') {
      const item = await getNewsItem(arg1);
      if (!item) {
        await show(inboxView(await listNewItems(), num(arg2)));
        return;
      }
      const made = await makeDraftFromNews(item);
      if (made.error) {
        await show(errorWithBack(made.error, `n:bk:${num(arg2)}`));
        return;
      }
      await show(draftView(made.draft));
      return;
    }
    if (action === 'n:dc') {
      await db
        .update(news_items)
        .set({ status: 'discarded' })
        .where(eq(news_items.id, num(arg1)))
        .run();
      await show(inboxView(await listNewItems(), num(arg2)));
      return;
    }
    if (action === 'n:del') {
      await db.delete(news_items).where(eq(news_items.id, num(arg1))).run();
      await show(inboxView(await listNewItems(), num(arg2)));
      return;
    }

    // --- Drafts ---
    if (action === 'd:vw') {
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(draftsView(await listDrafts(), 0));
        return;
      }
      await show(draftView(draft));
      return;
    }
    if (action === 'dr:pg') {
      await show(draftsView(await listDrafts(), num(arg1)));
      return;
    }
    if (action === 'd:pub') {
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(draftsView(await listDrafts(), 0));
        return;
      }
      await show(confirmPublishView(draft));
      return;
    }
    if (action === 'd:pc') {
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(draftsView(await listDrafts(), 0));
        return;
      }
      const done = await publishDraftNow(draft);
      if (done.error) {
        await show(errorWithBack(done.error, `d:vw:${draft.id}`));
        return;
      }
      const link = channelMessageLink(done.channelId, done.messageId);
      await show({
        text: 'منتشر شد.' + (link ? '\n' + link : ''),
        reply_markup: {
          inline_keyboard: [[{ text: 'منوی اصلی', callback_data: 'm:home' }]],
        },
      });
      return;
    }
    if (action === 'd:cx') {
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(draftsView(await listDrafts(), 0));
        return;
      }
      await show(draftView(draft));
      return;
    }
    if (action === 'd:ed') {
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(draftsView(await listDrafts(), 0));
        return;
      }
      await setSetting(`editing_draft:${ownerId}`, String(draft.id));
      await setSetting(`editing_draft_msg:${ownerId}`, `${chatId}:${messageId}`);
      await show(promptEditView(draft));
      return;
    }
    if (action === 'd:ec') {
      await deleteSetting(`editing_draft:${ownerId}`);
      await deleteSetting(`editing_draft_msg:${ownerId}`);
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(draftsView(await listDrafts(), 0));
        return;
      }
      await show(draftView(draft));
      return;
    }
    if (action === 'd:rw' || action === 'd:sh') {
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(draftsView(await listDrafts(), 0));
        return;
      }
      const res = await callWorker('/ai', {
        task: action === 'd:rw' ? 'rewrite' : 'shorten',
        title: draft.title,
        text: draft.body,
      });
      if (!res || res.ok !== true || typeof res.text !== 'string') {
        await show(errorWithBack(workerErrorMessage(res) || 'بازنویسی ممکن نشد.', `d:vw:${draft.id}`));
        return;
      }
      await db.update(drafts).set({ body: res.text }).where(eq(drafts.id, draft.id)).run();
      const updated = (await getDraft(draft.id)) || { ...draft, body: res.text };
      await show(draftView(updated));
      return;
    }
    if (action === 'd:sc') {
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(draftsView(await listDrafts(), 0));
        return;
      }
      await setSetting(`scheduling_draft:${ownerId}`, String(draft.id));
      await setSetting(`scheduling_draft_msg:${ownerId}`, `${chatId}:${messageId}`);
      await show(promptScheduleView(draft));
      return;
    }
    if (action === 'd:sx') {
      await deleteSetting(`scheduling_draft:${ownerId}`);
      await deleteSetting(`scheduling_draft_msg:${ownerId}`);
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(draftsView(await listDrafts(), 0));
        return;
      }
      await show(draftView(draft));
      return;
    }
    if (action === 'd:del') {
      const draft = await getDraft(arg1);
      if (draft && draft.status === 'scheduled') {
        // Cancel the queued KV entry first so Cron cannot publish a
        // draft that no longer exists.
        await callWorker('/schedule/cancel', { draft_id: draft.id });
      }
      await db.delete(drafts).where(eq(drafts.id, num(arg1))).run();
      await show(draftsView(await listDrafts(), 0));
      return;
    }
    if (action === 'd:cs') {
      const draft = await getDraft(arg1);
      if (!draft) {
        await show(scheduledView(await listScheduled(), 0));
        return;
      }
      const cancelled = await cancelSchedule(draft);
      if (cancelled.error) {
        await show(errorWithBack(cancelled.error, `d:vw:${draft.id}`));
        return;
      }
      const updated = (await getDraft(draft.id)) || { ...draft, status: 'draft', publish_at: null };
      await show(draftView(updated));
      return;
    }

    // --- Scheduled list ---
    if (action === 'sc:pg') {
      await show(scheduledView(await listScheduled(), num(arg1)));
      return;
    }
    if (action === 'sc:cx') {
      const draft = await getDraft(arg1);
      if (draft) {
        const cancelled = await cancelSchedule(draft);
        if (cancelled.error) {
          await show(errorWithBack(cancelled.error, `sc:pg:${num(arg2)}`));
          return;
        }
      }
      await show(scheduledView(await listScheduled(), num(arg2)));
      return;
    }

    // --- Feeds ---
    if (action === 'f:tg') {
      const feed = await getFeed(arg1);
      if (feed) {
        await db
          .update(rss_feeds)
          .set({ active: feed.active !== 0 ? 0 : 1 })
          .where(eq(rss_feeds.id, feed.id))
          .run();
      }
      await show(feedsView(await listFeeds()));
      return;
    }
    if (action === 'f:del') {
      await db.delete(rss_feeds).where(eq(rss_feeds.id, num(arg1))).run();
      await show(feedsView(await listFeeds()));
      return;
    }

    // --- Clear inbox ---
    if (action === 'cl:yes') {
      const rows = await db.select().from(news_items).all();
      let removed = 0;
      for (const row of rows) {
        if (row.status === 'new' || row.status === 'discarded') {
          await db.delete(news_items).where(eq(news_items.id, row.id)).run();
          removed += 1;
        }
      }
      await show({
        text: `${removed} خبر حذف شد.`,
        reply_markup: {
          inline_keyboard: [[{ text: 'منوی اصلی', callback_data: 'm:home' }]],
        },
      });
      return;
    }
    if (action === 'cl:no') {
      await show(mainMenuView(await getCounts()));
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
        await editScreen(
          chatId,
          messageId,
          errorView('خطایی رخ داد: ' + (err?.message || 'نامشخص')),
        );
      }
    } catch {
      // The fallback itself failed; nothing more to do.
    }
  }
}
