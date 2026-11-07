// Persian inline keyboards, bot-only. Every screen is one message that
// gets edited in place; buttons carry short callback data (64-byte limit).

// Main menu.
export function mainMenu() {
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
      [{ text: 'راهنما', callback_data: 'm:help' }],
    ],
  };
}

export function backToMenu() {
  return {
    inline_keyboard: [[{ text: 'منوی اصلی', callback_data: 'm:home' }]],
  };
}

// Inbox page: one row per item (truncated title), then pagination and
// actions. `page` is 0-based.
export function inboxKeyboard(items, page, totalPages) {
  const rows = items.map((item) => [
    {
      text: (item.title || item.link || '').slice(0, 45) || '(بدون عنوان)',
      callback_data: `n:it:${item.id}:${page}`,
    },
  ]);
  const nav = [];
  if (page > 0) nav.push({ text: '‹ قبلی', callback_data: `n:pg:${page - 1}` });
  if (page < totalPages - 1) {
    nav.push({ text: 'بعدی ›', callback_data: `n:pg:${page + 1}` });
  }
  if (nav.length > 0) rows.push(nav);
  rows.push([
    { text: 'گرفتن خبرهای تازه', callback_data: 'n:ft' },
    { text: 'منوی اصلی', callback_data: 'm:home' },
  ]);
  return { inline_keyboard: rows };
}

// Single news item view.
export function newsItemKeyboard(newsId, page) {
  return {
    inline_keyboard: [
      [
        { text: 'نوشتن پست', callback_data: `n:mk:${newsId}:${page}` },
        { text: 'رد کردن', callback_data: `n:dc:${newsId}:${page}` },
      ],
      [
        { text: '🗑️ حذف', callback_data: `n:del:${newsId}:${page}` },
        { text: 'بازگشت', callback_data: `n:bk:${page}` },
      ],
    ],
  };
}

// Draft view.
export function draftKeyboard(draftId) {
  return {
    inline_keyboard: [
      [
        { text: 'انتشار الان', callback_data: `d:pub:${draftId}` },
        { text: '✏️ ویرایش', callback_data: `d:ed:${draftId}` },
      ],
      [
        { text: 'بازنویسی', callback_data: `d:rw:${draftId}` },
        { text: 'کوتاه‌تر', callback_data: `d:sh:${draftId}` },
      ],
      [
        { text: 'زمان‌بندی', callback_data: `d:sc:${draftId}` },
        { text: '🗑️ حذف', callback_data: `d:del:${draftId}` },
      ],
      [{ text: 'پیش‌نویس‌ها', callback_data: 'm:dr' }],
    ],
  };
}

// Draft view when the draft is scheduled: adds "لغو زمان‌بندی".
export function scheduledDraftKeyboard(draftId) {
  return {
    inline_keyboard: [
      [
        { text: 'انتشار الان', callback_data: `d:pub:${draftId}` },
        { text: '✏️ ویرایش', callback_data: `d:ed:${draftId}` },
      ],
      [
        { text: 'بازنویسی', callback_data: `d:rw:${draftId}` },
        { text: 'کوتاه‌تر', callback_data: `d:sh:${draftId}` },
      ],
      [
        { text: 'لغو زمان‌بندی', callback_data: `d:cs:${draftId}` },
        { text: '🗑️ حذف', callback_data: `d:del:${draftId}` },
      ],
      [{ text: 'زمان‌بندی‌شده‌ها', callback_data: 'm:sc' }],
    ],
  };
}

export function confirmPublishKeyboard(draftId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ تایید و انتشار', callback_data: `d:pc:${draftId}` },
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

// Feeds list: one row per feed (toggle + delete).
export function feedsKeyboard(feeds) {
  const rows = feeds.map((feed) => [
    {
      text: `${feed.active !== 0 ? '✅' : '⏸️'} ${(feed.name || feed.url).slice(0, 18)}`,
      callback_data: `f:tg:${feed.id}`,
    },
    { text: '🗑️', callback_data: `f:del:${feed.id}` },
  ]);
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
