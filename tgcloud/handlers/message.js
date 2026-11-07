import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { settings, rss_feeds, news_items, drafts } from '../schema.js';
import { isOwner } from '../lib/auth.js';
import { APP_URL, DEFAULT_FEEDS } from '../lib/config.js';
import { callWorker } from '../lib/worker.js';
import {
  normalizeUrl,
  isYouTubeUrl,
  extractYouTubeUrl,
  parseTehranDateTime,
} from '../lib/pure.js';
import { mainMenu, newsItemButtons, draftButtons } from '../lib/keyboards.js';

const DRAFT_STATUS_FA = {
  draft: 'پیش‌نویس',
  scheduled: 'زمان‌بندی‌شده',
  published: 'منتشرشده',
  discarded: 'حذف‌شده',
};

const HELP_TEXT =
  'دستورها:\n' +
  '/start — شروع و منوی اصلی\n' +
  '/news — گرفتن خبرهای تازه از فیدها\n' +
  '/drafts — دیدن پیش‌نویس‌ها\n' +
  '/dashboard — باز کردن داشبورد\n' +
  '/addrss <url> [name] — اضافه کردن فید RSS\n' +
  '/help — همین راهنما\n\n' +
  'برای ساخت پست از یوتیوب، فقط لینک ویدیو را بفرستید.';

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

async function reply(chatId, text, replyMarkup) {
  await api.sendMessage({
    chat_id: chatId,
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

async function seedFeedsIfEmpty() {
  const existing = await db.select().from(rss_feeds).all();
  if (existing.length > 0) return existing;
  const now = Date.now();
  for (const feed of DEFAULT_FEEDS) {
    await db
      .insert(rss_feeds)
      .values({ url: feed.url, name: feed.name, active: 1, created_at: now })
      .run();
  }
  return db.select().from(rss_feeds).all();
}

async function fetchNews(chatId) {
  const feeds = await seedFeedsIfEmpty();
  const active = feeds.filter((f) => f.active !== 0);
  if (active.length === 0) {
    await reply(chatId, 'هیچ فید فعالی نیست. با /addrss یک فید اضافه کنید.');
    return;
  }
  const res = await callWorker('/news/fetch', {
    feeds: active.map((f) => f.url),
  });
  if (!res || res.ok !== true || !Array.isArray(res.items)) {
    await reply(chatId, 'گرفتن خبرها ممکن نشد. دوباره تلاش کنید.');
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
  await reply(chatId, `${inserted.length} خبر تازه اضافه شد.`);
  for (const item of inserted.slice(0, 10)) {
    await reply(
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
    await reply(chatId, 'هنوز پیش‌نویسی نیست.');
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
  await reply(chatId, lines.join('\n'));
  for (const d of shown.filter((x) => x.status === 'scheduled').slice(0, 5)) {
    await reply(chatId, formatDraft(d), {
      inline_keyboard: [
        [
          {
            text: 'لغو زمان‌بندی',
            callback_data: `draft_cancel_schedule:${d.id}`,
          },
        ],
      ],
    });
  }
}

async function handleYouTube(chatId, text) {
  const url = extractYouTubeUrl(text);
  if (!url) {
    await reply(chatId, 'لینک یوتیوب معتبر نیست.');
    return;
  }
  const res = await callWorker(
    '/link/preview?url=' + encodeURIComponent(url),
    null,
    'GET',
  );
  if (!res || res.ok !== true || res.kind !== 'youtube') {
    await reply(chatId, 'گرفتن اطلاعات ویدیو ممکن نشد. دوباره تلاش کنید.');
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
    await reply(chatId, 'ساخت پیش‌نویس ممکن نشد.');
    return;
  }
  const preview =
    (res.title || url) +
    (res.author_name ? '\n' + res.author_name : '') +
    '\n\nتوضیح را با دکمه ویرایش بنویسید.';
  await reply(chatId, preview, draftButtons(draft.id));
}

async function handlePendingEdit(chatId, ownerId, text) {
  const draftId = await getSetting(`editing_draft:${ownerId}`);
  if (!draftId) return false;
  const draft = await db
    .select()
    .from(drafts)
    .where(eq(drafts.id, Number(draftId)))
    .get();
  if (!draft) {
    await deleteSetting(`editing_draft:${ownerId}`);
    await reply(chatId, 'پیش‌نویس پیدا نشد.');
    return true;
  }
  await db
    .update(drafts)
    .set({ body: text })
    .where(eq(drafts.id, draft.id))
    .run();
  await deleteSetting(`editing_draft:${ownerId}`);
  const updated = await db
    .select()
    .from(drafts)
    .where(eq(drafts.id, draft.id))
    .get();
  await reply(chatId, formatDraft(updated || { ...draft, body: text }), draftButtons(draft.id));
  return true;
}

async function handlePendingSchedule(chatId, ownerId, text) {
  const draftId = await getSetting(`scheduling_draft:${ownerId}`);
  if (!draftId) return false;
  const publishAt = parseTehranDateTime(text);
  if (publishAt === null) {
    await reply(
      chatId,
      'زمان معتبر نیست. به این شکل بفرستید: 2026-11-08 18:00 یا فقط 18:00 برای امروز.',
    );
    return true;
  }
  if (publishAt <= Date.now()) {
    await reply(chatId, 'زمان باید در آینده باشد. یک زمان دیگر بفرستید.');
    return true;
  }
  const draft = await db
    .select()
    .from(drafts)
    .where(eq(drafts.id, Number(draftId)))
    .get();
  if (!draft) {
    await deleteSetting(`scheduling_draft:${ownerId}`);
    await reply(chatId, 'پیش‌نویس پیدا نشد.');
    return true;
  }
  const channelId = await getSetting('channel_id');
  if (!channelId) {
    await deleteSetting(`scheduling_draft:${ownerId}`);
    await reply(
      chatId,
      'کانال تنظیم نشده است. اول بات را در کانال ادمین کنید.',
    );
    return true;
  }
  const res = await callWorker('/schedule', {
    draft: draftPayload(draft),
    channel_id: Number(channelId),
    publish_at: publishAt,
  });
  if (!res || res.ok !== true) {
    await reply(chatId, 'زمان‌بندی ممکن نشد. دوباره تلاش کنید.');
    return true;
  }
  await db
    .update(drafts)
    .set({ status: 'scheduled', publish_at: publishAt })
    .where(eq(drafts.id, draft.id))
    .run();
  await deleteSetting(`scheduling_draft:${ownerId}`);
  await reply(chatId, 'زمان‌بندی شد برای ' + formatTehran(publishAt) + '.');
  return true;
}

export default async function (message, ctx) {
  const ownerId = message.from?.id;
  if (!isOwner(ownerId)) return;
  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  try {
    if (!text) {
      await reply(chatId, 'یک دستور یا لینک یوتیوب بفرستید. /help');
      return;
    }
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const command = parts[0].split('@')[0];
      if (command === '/start') {
        await reply(
          chatId,
          'سلام! من مدیر محتوای کانال هستم.\n\nخبرها را از فیدهای RSS می‌گیرم، با AI پست می‌نویسم و در کانال منتشر می‌کنم — الان یا سر ساعت.\n\nاز دکمه‌های زیر استفاده کنید یا /help را بفرستید.',
          mainMenu(),
        );
        return;
      }
      if (command === '/news') {
        await fetchNews(chatId);
        return;
      }
      if (command === '/drafts') {
        await listDrafts(chatId);
        return;
      }
      if (command === '/dashboard') {
        await reply(chatId, 'داشبورد:', {
          inline_keyboard: [
            [{ text: 'باز کردن داشبورد', web_app: { url: APP_URL } }],
          ],
        });
        return;
      }
      if (command === '/help') {
        await reply(chatId, HELP_TEXT);
        return;
      }
      if (command === '/addrss' || command === '/addfeed') {
        const url = parts[1];
        const name = parts.slice(2).join(' ') || null;
        if (!url || !url.startsWith('https://')) {
          await reply(chatId, 'آدرس فید باید با https:// شروع شود.');
          return;
        }
        let parsed;
        try {
          parsed = new URL(url);
        } catch {
          parsed = null;
        }
        if (!parsed || parsed.protocol !== 'https:') {
          await reply(chatId, 'آدرس فید معتبر نیست.');
          return;
        }
        const existing = await db
          .select()
          .from(rss_feeds)
          .where(eq(rss_feeds.url, url))
          .get();
        if (existing) {
          await reply(chatId, 'این فید قبلاً اضافه شده است.');
          return;
        }
        await db
          .insert(rss_feeds)
          .values({ url, name, active: 1, created_at: Date.now() })
          .run();
        await reply(chatId, 'فید اضافه شد: ' + (name || url));
        return;
      }
      await reply(chatId, 'این دستور را نمی‌شناسم. /help');
      return;
    }
    if (await handlePendingEdit(chatId, ownerId, text)) return;
    if (await handlePendingSchedule(chatId, ownerId, text)) return;
    if (isYouTubeUrl(text)) {
      await handleYouTube(chatId, text);
      return;
    }
    await reply(chatId, 'متوجه نشدم. /help را بفرستید تا دستورها را ببینید.');
  } catch {
    try {
      await reply(chatId, 'خطایی رخ داد. دوباره تلاش کنید.');
    } catch {
      // The error reply itself failed; nothing more to do.
    }
  }
}
