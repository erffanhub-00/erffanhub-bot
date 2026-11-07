// Persian inline keyboards, bot-only. Every screen is one message that
// gets edited in place; buttons carry short callback data (64-byte limit).
// The review queue has exactly 3 buttons per news item: confirm, previous,
// next. Group keys are short ('all', 'c<category index>', 'f<feed id>').

// Main menu. `counts` carries the YouTube draft count for its own row.
export function mainMenu(counts) {
  const youtube = counts?.youtube ?? 0;
  return {
    inline_keyboard: [
      [
        { text: 'خبرها', callback_data: 'm:in' },
        { text: 'پیش‌نویس‌ها', callback_data: 'm:dr' },
      ],
      [
        { text: 'زمان‌بندی‌شده‌ها', callback_data: 'm:sc' },
        { text: 'فیدها', callback_data: 'm:fd' },
      ],
      [{ text: `یوتیوب (${youtube})`, callback_data: 'm:yt' }],
      [{ text: 'راهنما', callback_data: 'm:help' }],
    ],
  };
}

export function backToMenu() {
  return {
    inline_keyboard: [[{ text: 'منوی اصلی', callback_data: 'm:home' }]],
  };
}

// Inbox menu: two sections — topic categories, then RSS feeds — each row a
// group button with its count, plus "all news", fetch and home.
export function inboxMenuKeyboard(groups, total) {
  const rows = [];
  for (const g of groups.categories) {
    rows.push([{ text: `${g.name} (${g.count})`, callback_data: `rv:g:${g.key}` }]);
  }
  for (const g of groups.feeds) {
    rows.push([{ text: `${g.name} (${g.count})`, callback_data: `rv:g:${g.key}` }]);
  }
  rows.push([{ text: `همه خبرها (${total})`, callback_data: 'rv:g:all' }]);
  rows.push([
    { text: 'گرفتن خبرهای تازه', callback_data: 'rv:ft' },
    { text: 'منوی اصلی', callback_data: 'm:home' },
  ]);
  return { inline_keyboard: rows };
}

// One news item in review: exactly 3 buttons — confirm, previous, next.
export function reviewKeyboard(groupKey, newsId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ تایید', callback_data: `rv:cf:${groupKey}:${newsId}` },
        { text: '◀ قبلی', callback_data: `rv:pv:${groupKey}:${newsId}` },
        { text: 'بعدی ▶', callback_data: `rv:nx:${groupKey}:${newsId}` },
      ],
    ],
  };
}

// Extra rows shared by both draft keyboards: a "watch on YouTube" URL
// button for video drafts, and (after a review confirm) a resume row.
function draftExtraRows(draft, opts) {
  const rows = [];
  if (draft?.kind === 'youtube' && draft?.button_url) {
    rows.push([{ text: 'تماشا در یوتیوب', url: draft.button_url }]);
  }
  if (opts?.resume) {
    rows.push([{ text: '↩ برگشت به بررسی', callback_data: 'rv:rs' }]);
  }
  return rows;
}

// Draft view. `draft` is the row object; `opts.resume` adds the
// "back to review" row (only after a confirm from the review queue).
export function draftKeyboard(draft, opts) {
  const id = typeof draft === 'object' ? draft.id : draft;
  const row = typeof draft === 'object' ? draft : null;
  return {
    inline_keyboard: [
      [
        { text: 'انتشار الان', callback_data: `d:pub:${id}` },
        { text: '✏️ ویرایش', callback_data: `d:ed:${id}` },
      ],
      [
        { text: 'بازنویسی', callback_data: `d:rw:${id}` },
        { text: 'کوتاه‌تر', callback_data: `d:sh:${id}` },
      ],
      [
        { text: 'زمان‌بندی', callback_data: `d:sc:${id}` },
        { text: '🗑️ حذف', callback_data: `d:del:${id}` },
      ],
      ...draftExtraRows(row, opts),
      [{ text: 'پیش‌نویس‌ها', callback_data: 'm:dr' }],
    ],
  };
}

// Draft view when the draft is scheduled: adds "لغو زمان‌بندی".
export function scheduledDraftKeyboard(draft, opts) {
  const id = typeof draft === 'object' ? draft.id : draft;
  const row = typeof draft === 'object' ? draft : null;
  return {
    inline_keyboard: [
      [
        { text: 'انتشار الان', callback_data: `d:pub:${id}` },
        { text: '✏️ ویرایش', callback_data: `d:ed:${id}` },
      ],
      [
        { text: 'بازنویسی', callback_data: `d:rw:${id}` },
        { text: 'کوتاه‌تر', callback_data: `d:sh:${id}` },
      ],
      [
        { text: 'لغو زمان‌بندی', callback_data: `d:cs:${id}` },
        { text: '🗑️ حذف', callback_data: `d:del:${id}` },
      ],
      ...draftExtraRows(row, opts),
      [{ text: 'زمان‌بندی‌شده‌ها', callback_data: 'm:sc' }],
    ],
  };
}

export function confirmPublishKeyboard(draftId) {
  return {
    inline_keyboard: [
      [
        {
          text: '✅ تایید و انتشار',
          callback_data: `d:pc:${draftId}`,
        },
        { text: 'لغو', callback_data: `d:cx:${draftId}` },
      ],
    ],
  };
}

// Drafts list page: one row per draft.
export function draftsKeyboard(items, page, totalPages) {
  const rows = items.map((item) => [
    {
      text: (item.title || '(بدون عنوان)').slice(0, 45),
      callback_data: `d:vw:${item.id}`,
    },
  ]);
  const nav = [];
  if (page > 0) nav.push({ text: '‹ قبلی', callback_data: `dr:pg:${page - 1}` });
  if (page < totalPages - 1) {
    nav.push({ text: 'بعدی ›', callback_data: `dr:pg:${page + 1}` });
  }
  if (nav.length > 0) rows.push(nav);
  rows.push([{ text: 'منوی اصلی', callback_data: 'm:home' }]);
  return { inline_keyboard: rows };
}

// YouTube drafts list page: same shape as the drafts list, its own
// pagination callbacks so the two lists never mix.
export function youtubeKeyboard(items, page, totalPages) {
  const rows = items.map((item) => [
    {
      text: (item.title || '(بدون عنوان)').slice(0, 45),
      callback_data: `d:vw:${item.id}`,
    },
  ]);
  const nav = [];
  if (page > 0) nav.push({ text: '‹ قبلی', callback_data: `yt:pg:${page - 1}` });
  if (page < totalPages - 1) {
    nav.push({ text: 'بعدی ›', callback_data: `yt:pg:${page + 1}` });
  }
  if (nav.length > 0) rows.push(nav);
  rows.push([{ text: 'منوی اصلی', callback_data: 'm:home' }]);
  return { inline_keyboard: rows };
}

// Scheduled list page: one cancel row per draft.
export function scheduledKeyboard(items, page, totalPages) {
  const rows = items.map((item) => [
    {
      text: '❌ لغو: ' + (item.title || '(بدون عنوان)').slice(0, 35),
      callback_data: `sc:cx:${item.id}:${page}`,
    },
    { text: '👁️', callback_data: `d:vw:${item.id}` },
  ]);
  const nav = [];
  if (page > 0) nav.push({ text: '‹ قبلی', callback_data: `sc:pg:${page - 1}` });
  if (page < totalPages - 1) {
    nav.push({ text: 'بعدی ›', callback_data: `sc:pg:${page + 1}` });
  }
  if (nav.length > 0) rows.push(nav);
  rows.push([{ text: 'منوی اصلی', callback_data: 'm:home' }]);
  return { inline_keyboard: rows };
}

// Feeds list: one row per feed (toggle + delete), plus the add button.
export function feedsKeyboard(feeds) {
  const rows = feeds.map((feed) => [
    {
      text: `${feed.active !== 0 ? '✅' : '⏸️'} ${(feed.name || feed.url).slice(0, 18)}`,
      callback_data: `f:tg:${feed.id}`,
    },
    { text: '🗑️', callback_data: `f:del:${feed.id}` },
  ]);
  rows.push([{ text: '➕ افزودن فید', callback_data: 'f:add' }]);
  rows.push([{ text: 'منوی اصلی', callback_data: 'm:home' }]);
  return { inline_keyboard: rows };
}

// Yes/no confirmation (used by /clear).
export function confirmKeyboard(yesData, noData) {
  return {
    inline_keyboard: [
      [
        { text: '✅ بله', callback_data: yesData },
        { text: 'لغو', callback_data: noData },
      ],
    ],
  };
}

// Cancel button shown while the bot waits for a text reply (edit/schedule).
export function cancelInputKeyboard(cancelData) {
  return {
    inline_keyboard: [[{ text: 'لغو', callback_data: cancelData }]],
  };
}

// "No name" button shown while the bot waits for a feed name.
export function noNameKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'بدون نام', callback_data: 'f:nn' },
        { text: 'لغو', callback_data: 'f:ax' },
      ],
    ],
  };
}
