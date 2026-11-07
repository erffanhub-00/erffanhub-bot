import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { settings, rss_feeds, news_items, drafts, publish_log } from '../schema.js';
import { isOwner } from '../lib/auth.js';
import { DEFAULT_FEEDS } from '../lib/config.js';
import { callWorker } from '../lib/worker.js';
import { normalizeUrl } from '../lib/pure.js';
import {
  newsItemButtons,
  draftButtons,
  confirmPublishButtons,
} from '../lib/keyboards.js';

const DRAFT_STATUS_FA = {
  draft: 'پیش‌نویس',
  scheduled: 'زمان‌بندی‌شده',
  published: 'منتشرشده',
  discarded: 'حذف‌شده',
};

async function getSetting(key) {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? row.value : null;
}

async function setSetting(key, value) {
  const existing = await getSetting(key);
  if (existing === null) {
    await db.insert(settings).values({ key, value }).run();
  } else {
    await db.update(settings).set({ value }).where(eq(settings.key, key)).run();
  }
}

async function deleteSetting(key) {
  await db.delete(settings).where(eq(settings.key, key)).run();
}

async function sendMessage(chatId, text, replyMarkup) {
  await api.sendMessage({
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function editMessage(chatId, messageId, text, replyMarkup) {
  await api.editMessageText({
    chat_id: chatId,
    message_id: messageId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function truncate(text, max) {
  const s = String(text ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function formatTehran(ms) {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

function formatDraft(draft) {
  const lines = [];
  if (draft.title) lines.push(draft.title);
  if (draft.body) lines.push('', draft.body);
  if (draft.source_url) {
    lines.push('', (draft.kind === 'youtube' ? 'ویدیو: ' : 'منبع: ') + draft.source_url);
  }
  if (draft.status === 'scheduled' && draft.publish_at) {
    lines.push('', 'زمان انتشار: ' + formatTehran(draft.publish_at));
  }
  const text = lines.join('\n').trim() || '(پیش‌نویس خالی)';
  return truncate(text, 4000);
}

// Draft shape the Worker expects for /publish and /schedule.
function draftPayload(draft) {
  return {
    id: draft.id,
    title: draft.title,
    body: draft.body,
    media_url: draft.media_url || undefined,
    source_url: draft.source_url || undefined,
    button_text: draft.button_text || undefined,
    button_url: draft.button_url || undefined,
  };
}

function channelMessageLink(channelId, messageId) {
  const s = String(channelId);
  if (s.startsWith('-100')) return `https://t.me/c/${s.slice(4)}/${messageId}`;
  return null;
}

function parsePublishedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1000000000000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

async function fetchNews(chatId) {
  let feeds = await db.select().from(rss_feeds).all();
  if (feeds.length === 0) {
    const now = Date.now();
    for (const feed of DEFAULT_FEEDS) {
      await db
        .insert(rss_feeds)
        .values({ url: feed.url, name: feed.name, active: 1, created_at: now })
        .run();
    }
    feeds = await db.select().from(rss_feeds).all();
  }
  const active = feeds.filter((f) => f.active !== 0);
  if (active.length === 0) {
    await sendMessage(chatId, 'هیچ فید فعالی نیست. با /addrss یک فید اضافه کنید.');
    return;
  }
  const res = await callWorker('/news/fetch', {
    feeds: active.map((f) => f.url),
  });
  if (!res || res.ok !== true || !Array.isArray(res.items)) {
    await sendMessage(chatId, 'گرفتن خبرها ممکن نشد. دوباره تلاش کنید.');
    return;
  }
  const now = Date.now();
  const inserted = [];
  for (const item of res.items) {
    if (!item || !item.link) continue;
    const guid = item.guid || normalizeUrl(item.link);
    const link = normalizeUrl(item.link);
    const byGuid = await db
      .select()
      .from(news_items)
      .where(eq(news_items.guid, guid))
      .get();
    if (byGuid) continue;
    const byLink = await db
      .select()
      .from(news_items)
      .where(eq(news_items.link, link))
      .get();
    if (byLink) continue;
    const feed = active.find((f) => f.url === item.feed_url) || null;
    const rows = await db
      .insert(news_items)
      .values({
        feed_id: feed ? feed.id : null,
        guid,
        title: item.title || link,
        link,
        description: item.description || null,
        published_at: parsePublishedAt(item.published_at),
        fetched_at: now,
        status: 'new',
      })
      .returning()
      .run();
    if (rows && rows[0]) inserted.push(rows[0]);
  }
  for (const feed of active) {
    await db
      .update(rss_feeds)
      .set({ last_fetched_at: now, last_error: null })
      .where(eq(rss_feeds.id, feed.id))
      .run();
  }
  await sendMessage(chatId, `${inserted.length} خبر تازه اضافه شد.`);
  for (const item of inserted.slice(0, 10)) {
    await sendMessage(
      chatId,
      truncate(item.title, 500) + '\n' + item.link,
      newsItemButtons(item.id),
    );
  }
}

async function listDrafts(chatId) {
  const rows = await db.select().from(drafts).all();
  rows.sort((a, b) => b.id - a.id);
  const shown = rows.slice(0, 20);
  if (shown.length === 0) {
    await sendMessage(chatId, 'هنوز پیش‌نویسی نیست.');
    return;
  }
  const lines = shown.map((d) => {
    const status = DRAFT_STATUS_FA[d.status] || d.status || 'پیش‌نویس';
    const when =
      d.status === 'scheduled' && d.publish_at
        ? ' — ' + formatTehran(d.publish_at)
        : '';
    return `#${d.id} — ${truncate(d.title || '(بدون عنوان)', 60)} (${status}${when})`;
  });
  await sendMessage(chatId, lines.join('\n'));
}

// Build a draft from a news item with the AI writer. Returns the draft
// row, or null when the Worker call failed.
async function makeDraftFromNews(item) {
  const res = await callWorker('/ai', {
    task: 'write_post',
    title: item.title,
    text: item.description || '',
    source_url: item.link,
  });
  if (!res || res.ok !== true || typeof res.text !== 'string') return null;
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
  if (!rows || !rows[0]) return null;
  await db
    .update(news_items)
    .set({ status: 'selected' })
    .where(eq(news_items.id, item.id))
    .run();
  return rows[0];
}

async function publishDraftNow(chatId, messageId, draft) {
  const channelId = await getSetting('channel_id');
  if (!channelId) {
    await sendMessage(chatId, 'کانال تنظیم نشده است. اول بات را در کانال ادمین کنید.');
    return;
  }
  const res = await callWorker('/publish', {
    draft: draftPayload(draft),
    channel_id: Number(channelId),
  });
  if (!res || res.ok !== true || !res.message_id) {
    const detail = res && res.error ? ': ' + res.error : '';
    await sendMessage(chatId, 'انتشار ممکن نشد' + detail + '. پیش‌نویس دست نخورده باقی ماند.');
    return;
  }
  await db
    .update(drafts)
    .set({ status: 'published' })
    .where(eq(drafts.id, draft.id))
    .run();
  await db
    .insert(publish_log)
    .values({
      draft_id: draft.id,
      channel_id: Number(channelId),
      message_id: res.message_id,
      published_at: Date.now(),
    })
    .run();
  const link = channelMessageLink(channelId, res.message_id);
  await editMessage(
    chatId,
    messageId,
    'منتشر شد.' + (link ? '\n' + link : ''),
  );
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
    const action = parts[0];
    const arg1 = parts[1];

    if (action === 'menu' && arg1 === 'fetch_news') {
      await fetchNews(chatId);
      return;
    }
    if (action === 'menu' && arg1 === 'drafts') {
      await listDrafts(chatId);
      return;
    }

    if (action === 'news_make') {
      const item = await db
        .select()
        .from(news_items)
        .where(eq(news_items.id, Number(arg1)))
        .get();
      if (!item) {
        await editMessage(chatId, messageId, 'خبر پیدا نشد.');
        return;
      }
      const draft = await makeDraftFromNews(item);
      if (!draft) {
        await sendMessage(chatId, 'نوشتن پست با AI ممکن نشد. دوباره تلاش کنید.');
        return;
      }
      await editMessage(chatId, messageId, formatDraft(draft), draftButtons(draft.id));
      return;
    }

    if (action === 'news_discard') {
      await db
        .update(news_items)
        .set({ status: 'discarded' })
        .where(eq(news_items.id, Number(arg1)))
        .run();
      await editMessage(chatId, messageId, 'رد شد.');
      return;
    }

    if (action === 'draft_publish') {
      const draft = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, Number(arg1)))
        .get();
      if (!draft) {
        await editMessage(chatId, messageId, 'پیش‌نویس پیدا نشد.');
        return;
      }
      await editMessage(
        chatId,
        messageId,
        formatDraft(draft) + '\n\nآیا مطمئن هستید؟',
        confirmPublishButtons(draft.id),
      );
      return;
    }

    if (action === 'draft_publish_confirm') {
      const draft = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, Number(arg1)))
        .get();
      if (!draft) {
        await editMessage(chatId, messageId, 'پیش‌نویس پیدا نشد.');
        return;
      }
      await publishDraftNow(chatId, messageId, draft);
      return;
    }

    if (action === 'draft_publish_cancel') {
      const draft = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, Number(arg1)))
        .get();
      if (!draft) {
        await editMessage(chatId, messageId, 'پیش‌نویس پیدا نشد.');
        return;
      }
      await editMessage(chatId, messageId, formatDraft(draft), draftButtons(draft.id));
      return;
    }

    if (action === 'draft_edit') {
      await setSetting(`editing_draft:${ownerId}`, String(arg1));
      await sendMessage(chatId, 'متن جدید پست را بفرستید.');
      return;
    }

    if (action === 'draft_rewrite' || action === 'draft_shorter') {
      const draft = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, Number(arg1)))
        .get();
      if (!draft) {
        await editMessage(chatId, messageId, 'پیش‌نویس پیدا نشد.');
        return;
      }
      const res = await callWorker('/ai', {
        task: action === 'draft_rewrite' ? 'rewrite' : 'shorten',
        title: draft.title,
        text: draft.body,
      });
      if (!res || res.ok !== true || typeof res.text !== 'string') {
        await sendMessage(chatId, 'بازنویسی ممکن نشد. دوباره تلاش کنید.');
        return;
      }
      await db
        .update(drafts)
        .set({ body: res.text })
        .where(eq(drafts.id, draft.id))
        .run();
      const updated = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draft.id))
        .get();
      await editMessage(
        chatId,
        messageId,
        formatDraft(updated || { ...draft, body: res.text }),
        draftButtons(draft.id),
      );
      return;
    }

    if (action === 'draft_schedule') {
      await setSetting(`scheduling_draft:${ownerId}`, String(arg1));
      await sendMessage(
        chatId,
        'زمان انتشار را به وقت تهران بفرستید: 2026-11-08 18:00 یا فقط 18:00 برای امروز.',
      );
      return;
    }

    if (action === 'draft_discard') {
      await db
        .update(drafts)
        .set({ status: 'discarded' })
        .where(eq(drafts.id, Number(arg1)))
        .run();
      await editMessage(chatId, messageId, 'پیش‌نویس حذف شد.');
      return;
    }

    if (action === 'draft_cancel_schedule') {
      const draft = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, Number(arg1)))
        .get();
      if (!draft) {
        await editMessage(chatId, messageId, 'پیش‌نویس پیدا نشد.');
        return;
      }
      const res = await callWorker('/schedule/cancel', {
        draft_id: Number(arg1),
      });
      if (!res || res.ok !== true) {
        await sendMessage(chatId, 'لغو زمان‌بندی ممکن نشد. دوباره تلاش کنید.');
        return;
      }
      await db
        .update(drafts)
        .set({ status: 'draft', publish_at: null })
        .where(eq(drafts.id, draft.id))
        .run();
      const updated = await db
        .select()
        .from(drafts)
        .where(eq(drafts.id, draft.id))
        .get();
      await editMessage(
        chatId,
        messageId,
        'زمان‌بندی لغو شد.\n\n' +
          formatDraft(updated || { ...draft, status: 'draft', publish_at: null }),
        draftButtons(draft.id),
      );
      return;
    }
  } catch {
    try {
      if (!answered) {
        await api.answerCallbackQuery({
          callback_query_id: queryId,
          text: 'خطایی رخ داد.',
        });
      } else if (chatId) {
        await sendMessage(chatId, 'خطایی رخ داد. دوباره تلاش کنید.');
      }
    } catch {
      // The fallback reply itself failed; nothing more to do.
    }
  }
}
