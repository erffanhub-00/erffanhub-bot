// Screen builders: every screen is one message ({ text, reply_markup })
// that the handlers edit in place. No screen builder sends anything;
// the handlers own all api calls. Pure except for the data passed in.

import { paginate } from './pure.js';
import { truncate, formatTehran, formatDraft, DRAFT_STATUS_FA } from './format.js';
import {
  mainMenu,
  backToMenu,
  inboxKeyboard,
  newsItemKeyboard,
  draftKeyboard,
  scheduledDraftKeyboard,
  confirmPublishKeyboard,
  draftsKeyboard,
  scheduledKeyboard,
  feedsKeyboard,
  confirmKeyboard,
  cancelInputKeyboard,
} from './keyboards.js';

export const PAGE_SIZE = 5;

export const HELP_TEXT =
  'دستورها:\n' +
  '/start — منوی اصلی\n' +
  '/news — گرفتن خبرهای تازه و دیدن صندوق خبر\n' +
  '/drafts — پیش‌نویس‌ها\n' +
  '/scheduled — پست‌های زمان‌بندی‌شده\n' +
  '/feeds — مدیریت فیدهای RSS\n' +
  '/diag — بررسی سلامت اتصال به Worker و AI\n' +
  '/clear — حذف خبرهای جدید و ردشده\n' +
  '/addrss <url> [name] — اضافه کردن فید RSS\n' +
  '/help — همین راهنما\n\n' +
  'برای ساخت پست از یوتیوب، فقط لینک ویدیو را بفرستید.';

export function mainMenuView(counts) {
  const text =
    'مدیر محتوای کانال\n\n' +
    `خبرهای جدید: ${counts.newsNew} | پیش‌نویس: ${counts.drafts} | زمان‌بندی‌شده: ${counts.scheduled}\n` +
    `فیدها: ${counts.feedsActive} فعال از ${counts.feedsTotal}`;
  return { text, reply_markup: mainMenu() };
}

export function helpView() {
  return { text: HELP_TEXT, reply_markup: backToMenu() };
}

export function errorView(message) {
  return { text: message, reply_markup: backToMenu() };
}

export function inboxView(items, page) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'صندوق خبر خالی است.\n\nبا دکمه «گرفتن خبرهای تازه» خبرها را بگیرید.',
      reply_markup: inboxKeyboard([], 0, 1),
    };
  }
  const lines = pageItems.map((item, i) => {
    const n = safePage * PAGE_SIZE + i + 1;
    return `${n}. ${truncate(item.title || item.link || '(بدون عنوان)', 80)}`;
  });
  const text =
    `صندوق خبر — ${total} خبر جدید (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    lines.join('\n');
  return { text: truncate(text, 4000), reply_markup: inboxKeyboard(pageItems, safePage, totalPages) };
}

export function itemView(item, feedName, page) {
  const lines = [truncate(item.title || '(بدون عنوان)', 500)];
  const meta = [];
  if (feedName) meta.push(feedName);
  const when = item.published_at || item.fetched_at;
  if (when) meta.push(formatTehran(when));
  if (meta.length > 0) lines.push(meta.join(' — '));
  if (item.description) lines.push('', truncate(item.description, 800));
  if (item.link) lines.push('', item.link);
  return {
    text: truncate(lines.join('\n'), 4000),
    reply_markup: newsItemKeyboard(item.id, page),
  };
}

export function draftView(draft) {
  const status = DRAFT_STATUS_FA[draft.status] || draft.status || '';
  const text = formatDraft(draft) + (status ? `\n\nوضعیت: ${status}` : '');
  const keyboard =
    draft.status === 'scheduled' ? scheduledDraftKeyboard(draft.id) : draftKeyboard(draft.id);
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
      text: 'هنوز پیش‌نویسی نیست.\n\nاز صندوق خبر یک خبر را انتخاب کنید و «نوشتن پست» را بزنید.',
      reply_markup: backToMenu(),
    };
  }
  const lines = pageItems.map((d) => {
    const status = DRAFT_STATUS_FA[d.status] || d.status || 'پیش‌نویس';
    const when =
      d.status === 'scheduled' && d.publish_at ? ' — ' + formatTehran(d.publish_at) : '';
    return `${truncate(d.title || '(بدون عنوان)', 60)} (${status}${when})`;
  });
  const text =
    `پیش‌نویس‌ها — ${total} مورد (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    lines.join('\n');
  return { text: truncate(text, 4000), reply_markup: draftsKeyboard(pageItems, safePage, totalPages) };
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
      text: 'هیچ فیدی نیست.\n\nبا /addrss <url> [name] یک فید اضافه کنید.',
      reply_markup: backToMenu(),
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
    `فیدها: ${r.counts.feedsActive} فعال از ${r.counts.feedsTotal} | خبرهای جدید: ${r.counts.newsNew} | پیش‌نویس: ${r.counts.drafts} | زمان‌بندی‌شده: ${r.counts.scheduled} | منتشرشده: ${r.counts.published}`,
  );
  return { text: truncate(lines.join('\n'), 4000), reply_markup: backToMenu() };
}
