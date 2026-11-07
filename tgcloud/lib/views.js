// Screen builders: every screen is one message ({ text, reply_markup })
// that the handlers edit in place. No screen builder sends anything;
// the handlers own all api calls. Pure except for the data passed in.

import { paginate } from './pure.js';
import { truncate, formatTehran, formatDraft, DRAFT_STATUS_FA } from './format.js';
import { categoryOf } from './categories.js';
import {
  mainMenu,
  backToMenu,
  inboxMenuKeyboard,
  reviewKeyboard,
  draftKeyboard,
  scheduledDraftKeyboard,
  confirmPublishKeyboard,
  draftsKeyboard,
  youtubeKeyboard,
  scheduledKeyboard,
  feedsKeyboard,
  confirmKeyboard,
  cancelInputKeyboard,
  noNameKeyboard,
} from './keyboards.js';

export const PAGE_SIZE = 5;

export const HELP_TEXT =
  'دستورها:\n' +
  '/start — منوی اصلی\n' +
  '/news — گرفتن خبرهای تازه و دیدن صندوق خبر\n' +
  '/drafts — پیش‌نویس‌ها\n' +
  '/scheduled — پست‌های زمان‌بندی‌شده\n' +
  '/feeds — مدیریت فیدهای RSS (دکمه افزودن فید هم همان‌جاست)\n' +
  '/diag — بررسی سلامت اتصال به Worker و AI\n' +
  '/clear — حذف خبرهای جدید\n' +
  '/addrss <url> [name] — اضافه کردن فید RSS\n' +
  '/help — همین راهنما\n\n' +
  'صندوق خبر: اول دسته (موضوع یا فید) را انتخاب می‌کنی، بعد خبرها یکی‌یکی\n' +
  'می‌آیند: تایید یعنی ساخت پست، قبلی/بعدی یعنی ورق زدن. خبر تاییدنشده\n' +
  '۳ روز در صندوق می‌ماند و بعد پاک می‌شود.\n\n' +
  'برای ساخت پست از یوتیوب، فقط لینک ویدیو را بفرستید.';

export function mainMenuView(counts) {
  const text =
    'مدیر محتوای کانال\n\n' +
    `خبرهای جدید: ${counts.newsNew} | پیش‌نویس: ${counts.drafts} | زمان‌بندی‌شده: ${counts.scheduled}\n` +
    `فیدها: ${counts.feedsActive} فعال از ${counts.feedsTotal} | یوتیوب: ${counts.youtube}`;
  return { text, reply_markup: mainMenu(counts) };
}

export function helpView() {
  return { text: HELP_TEXT, reply_markup: backToMenu() };
}

export function errorView(message) {
  return { text: message, reply_markup: backToMenu() };
}

// Inbox menu: topic categories, then RSS feeds, each with its count.
export function inboxMenuView(groups, total) {
  if (total === 0) {
    return {
      text: 'صندوق خبر خالی است.\n\nبا دکمه «گرفتن خبرهای تازه» خبرها را بگیرید.',
      reply_markup: inboxMenuKeyboard(groups, 0),
    };
  }
  const lines = ['صندوق خبر — ' + total + ' خبر جدید', ''];
  if (groups.categories.length > 0) {
    lines.push('دسته‌ها:');
    for (const g of groups.categories) lines.push(`• ${g.name} (${g.count})`);
    lines.push('');
  }
  if (groups.feeds.length > 0) {
    lines.push('فیدها:');
    for (const g of groups.feeds) lines.push(`• ${g.name} (${g.count})`);
  }
  lines.push('');
  lines.push('یک دسته یا فید را انتخاب کن تا خبرهایش را یکی‌یکی ببینی.');
  return {
    text: truncate(lines.join('\n'), 4000),
    reply_markup: inboxMenuKeyboard(groups, total),
  };
}

// One news item in the review queue. Exactly 3 buttons: confirm, previous,
// next. `index` is 0-based inside the group; the group key travels in the
// button data so prev/next stay in the same group.
export function reviewView(item, groupKey, groupName, index, total, feedName) {
  const lines = [];
  lines.push(`${groupName} — خبر ${index + 1} از ${total}`);
  lines.push('');
  lines.push(truncate(item.title || '(بدون عنوان)', 500));
  const meta = [];
  meta.push('دسته: ' + categoryOf(item));
  if (feedName) meta.push('منبع: ' + feedName);
  const when = item.published_at || item.fetched_at;
  if (when) meta.push(formatTehran(when));
  lines.push(meta.join(' | '));
  if (item.description) lines.push('', truncate(item.description, 800));
  if (item.link) lines.push('', item.link);
  return {
    text: truncate(lines.join('\n'), 4000),
    reply_markup: reviewKeyboard(groupKey, item.id),
  };
}

export function groupFinishedView(groupName) {
  return {
    text: `«${groupName}» تموم شد ✓\n\nهمه خبرهای این دسته تعیین تکلیف شدند.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: 'صندوق خبر', callback_data: 'rv:menu' }],
        [{ text: 'منوی اصلی', callback_data: 'm:home' }],
      ],
    },
  };
}

export function draftView(draft, opts) {
  const status = DRAFT_STATUS_FA[draft.status] || draft.status || '';
  const head = draft.kind === 'youtube' ? '🎬 ویدیوی یوتیوب\n\n' : '';
  const text = head + formatDraft(draft) + (status ? `\n\nوضعیت: ${status}` : '');
  const keyboard =
    draft.status === 'scheduled'
      ? scheduledDraftKeyboard(draft, opts)
      : draftKeyboard(draft, opts);
  return { text: truncate(text, 4000), reply_markup: keyboard };
}

export function confirmPublishView(draft) {
  return {
    text: truncate(formatDraft(draft) + '\n\nآیا مطمئن هستید؟', 4000),
    reply_markup: confirmPublishKeyboard(draft.id),
  };
}

export function draftsView(items, page) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هنوز پیش‌نویسی نیست.\n\nاز صندوق خبر یک خبر را انتخاب کنید و «تایید» را بزنید.',
      reply_markup: backToMenu(),
    };
  }
  const lines = pageItems.map((d) => {
    const kind = d.kind === 'youtube' ? '[یوتیوب]' : '[خبر]';
    const status = DRAFT_STATUS_FA[d.status] || d.status || 'پیش‌نویس';
    const when =
      d.status === 'scheduled' && d.publish_at ? ' — ' + formatTehran(d.publish_at) : '';
    return `${kind} ${truncate(d.title || '(بدون عنوان)', 55)} (${status}${when})`;
  });
  const text =
    `پیش‌نویس‌ها — ${total} مورد (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    lines.join('\n');
  return { text: truncate(text, 4000), reply_markup: draftsKeyboard(pageItems, safePage, totalPages) };
}

export function youtubeView(items, page) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هنوز ویدیوی یوتیوبی نیست.\n\nلینک یک ویدیو را بفرستید تا پیش‌نویسش ساخته شود.',
      reply_markup: backToMenu(),
    };
  }
  const lines = pageItems.map((d) => {
    const status = DRAFT_STATUS_FA[d.status] || d.status || 'پیش‌نویس';
    const when =
      d.status === 'scheduled' && d.publish_at ? ' — ' + formatTehran(d.publish_at) : '';
    return `${truncate(d.title || '(بدون عنوان)', 55)} (${status}${when})`;
  });
  const text =
    `ویدیوهای یوتیوب — ${total} مورد (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    lines.join('\n');
  return { text: truncate(text, 4000), reply_markup: youtubeKeyboard(pageItems, safePage, totalPages) };
}

export function scheduledView(items, page) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هیچ پست زمان‌بندی‌شده‌ای نیست.',
      reply_markup: backToMenu(),
    };
  }
  const lines = pageItems.map((d) => {
    const when = d.publish_at ? formatTehran(d.publish_at) : '؟';
    return `${when} — ${truncate(d.title || '(بدون عنوان)', 60)}`;
  });
  const text =
    `زمان‌بندی‌شده‌ها — ${total} مورد (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    lines.join('\n');
  return {
    text: truncate(text, 4000),
    reply_markup: scheduledKeyboard(pageItems, safePage, totalPages),
  };
}

export function feedsView(feeds) {
  if (feeds.length === 0) {
    return {
      text: 'هیچ فیدی نیست.\n\nبا دکمه «➕ افزودن فید» یک فید اضافه کنید.',
      reply_markup: feedsKeyboard(feeds),
    };
  }
  const lines = feeds.map((f) => {
    const state = f.active !== 0 ? '✅ فعال' : '⏸️ غیرفعال';
    return `${state} — ${f.name || f.url}\n${f.url}`;
  });
  const text = 'فیدهای RSS:\n\n' + lines.join('\n\n');
  return { text: truncate(text, 4000), reply_markup: feedsKeyboard(feeds) };
}

export function promptEditView(draft) {
  return {
    text: 'متن جدید پست را بفرستید.\n\n' + truncate(formatDraft(draft), 3000),
    reply_markup: cancelInputKeyboard(`d:ec:${draft.id}`),
  };
}

export function promptScheduleView(draft, note = '') {
  const head = note
    ? note + '\nزمان انتشار را به وقت تهران بفرستید.\nمثال: 2026-11-08 18:00 یا فقط 18:00 برای امروز.\n\n'
    : 'زمان انتشار را به وقت تهران بفرستید.\nمثال: 2026-11-08 18:00 یا فقط 18:00 برای امروز.\n\n';
  return {
    text: head + truncate(formatDraft(draft), 3000),
    reply_markup: cancelInputKeyboard(`d:sx:${draft.id}`),
  };
}

// Ask for the feed URL (step 1 of the in-bot add-feed flow).
export function promptFeedUrlView(note = '') {
  const head = note ? note + '\n' : '';
  return {
    text: head + 'آدرس فید RSS را بفرستید.\nمثال: https://www.zoomit.ir/feed/',
    reply_markup: cancelInputKeyboard('f:ax'),
  };
}

// Ask for the feed name (step 2). Sending «-» also skips the name.
export function promptFeedNameView(url) {
  return {
    text: `آدرس: ${url}\n\nنام فید را بفرستید (اختیاری) یا «بدون نام» را بزنید.`,
    reply_markup: noNameKeyboard(),
  };
}

export function clearAskView(count) {
  return {
    text:
      `همه خبرهای جدید و ردشده (${count} مورد) حذف شوند؟\n` +
      'پیش‌نویس‌ها حذف نمی‌شوند.',
    reply_markup: confirmKeyboard('cl:yes', 'cl:no'),
  };
}

export function diagView(r) {
  const mark = (ok) => (ok ? '✓' : '✗');
  const lines = ['تشخیص:'];
  lines.push(`${mark(r.workerOk)} Worker در دسترس است${r.workerError ? ' — ' + r.workerError : ''}`);
  lines.push(`${mark(r.secretOk)} سکرت مشترک درست است${r.secretError ? ' — ' + r.secretError : ''}`);
  lines.push(`${mark(r.aiOk)} AI کار می‌کند${r.aiError ? ' — ' + r.aiError : ''}`);
  lines.push(`${mark(r.kvOk)} KV تنظیم شده${r.kvError ? ' — ' + r.kvError : ''}`);
  lines.push(
    r.channel
      ? `✓ کانال تنظیم شده${r.channel.title ? ' (' + r.channel.title + ')' : ''}`
      : '✗ کانال تنظیم نشده — بات را در کانال ادمین کنید.',
  );
  lines.push('');
  lines.push(
    `فیدها: ${r.counts.feedsActive} فعال از ${r.counts.feedsTotal} | خبرهای جدید: ${r.counts.newsNew} | پیش‌نویس: ${r.counts.drafts} | زمان‌بندی‌شده: ${r.counts.scheduled} | منتشرشده: ${r.counts.published} | یوتیوب: ${r.counts.youtube}`,
  );
  return { text: truncate(lines.join('\n'), 4000), reply_markup: backToMenu() };
}
