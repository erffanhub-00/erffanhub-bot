// Persian inline keyboards. Every screen is one message that gets
// edited in place; buttons carry short callback data (64-byte limit).

import { CHANNEL_URL, GROUP_URL } from './config.js';

// Main menu. The owner also gets the stats button.
export function mainMenu(owner) {
  const rows = [
    [
      { text: '📦 پروژه‌های گیت‌هاب', callback_data: 'm:projects' },
      { text: '🔗 شبکه‌های اجتماعی', callback_data: 'm:socials' },
    ],
    [
      { text: '📁 فایل‌ها', callback_data: 'm:files' },
      { text: '🔍 جستجو', callback_data: 'm:search' },
    ],
  ];
  if (owner) rows.push([{ text: '📊 آمار من', callback_data: 'm:stats' }]);
  rows.push([{ text: 'راهنما', callback_data: 'm:help' }]);
  return { inline_keyboard: rows };
}

export function backToMenu() {
  return {
    inline_keyboard: [[{ text: 'منوی اصلی', callback_data: 'm:home' }]],
  };
}

// Force-join screen: join buttons (URLs) + the "check membership"
// button. `missing` is { channel: bool, group: bool }.
export function joinKeyboard(missing) {
  const rows = [];
  if (missing.channel && CHANNEL_URL) {
    rows.push([{ text: 'عضویت در کانال', url: CHANNEL_URL }]);
  }
  if (missing.group && GROUP_URL) {
    rows.push([{ text: 'عضویت در گروه', url: GROUP_URL }]);
  }
  rows.push([{ text: '✅ بررسی عضویت', callback_data: 'm:check' }]);
  return { inline_keyboard: rows };
}

// File list page: one row per file. `backData` is the back button
// target ('m:home' by default, 'm:files' from a category list).
export function filesKeyboard(items, page, totalPages, prefix, backData = 'm:home') {
  const rows = items.map((item) => [
    {
      text: `${item.id} — ${(item.title || '(بدون عنوان)').slice(0, 35)}`,
      callback_data: `fl:vw:${item.id}`,
    },
  ]);
  const nav = [];
  if (page > 0) nav.push({ text: '‹ قبلی', callback_data: `${prefix}:pg:${page - 1}` });
  if (page < totalPages - 1) {
    nav.push({ text: 'بعدی ›', callback_data: `${prefix}:pg:${page + 1}` });
  }
  if (nav.length > 0) rows.push(nav);
  rows.push([{ text: 'منوی اصلی', callback_data: backData }]);
  return { inline_keyboard: rows };
}

// Category file list page: paging keeps the category index.
export function categoryFilesKeyboard(items, page, totalPages, catIndex) {
  const rows = items.map((item) => [
    {
      text: `${item.id} — ${(item.title || '(بدون عنوان)').slice(0, 35)}`,
      callback_data: `fl:vw:${item.id}`,
    },
  ]);
  const nav = [];
  if (page > 0) nav.push({ text: '‹ قبلی', callback_data: `fc:pg:${catIndex}:${page - 1}` });
  if (page < totalPages - 1) {
    nav.push({ text: 'بعدی ›', callback_data: `fc:pg:${catIndex}:${page + 1}` });
  }
  if (nav.length > 0) rows.push(nav);
  rows.push([{ text: 'دسته‌ها', callback_data: 'm:files' }]);
  rows.push([{ text: 'منوی اصلی', callback_data: 'm:home' }]);
  return { inline_keyboard: rows };
}

// Files menu: categories with counts + "all files". `categories` is
// [{ name, count }]; indices are resolved live from the same ordering.
export function categoriesKeyboard(categories, total) {
  const rows = categories.map((c, i) => [
    { text: `${c.name} (${c.count})`, callback_data: `fl:cat:${i}` },
  ]);
  rows.push([{ text: `همه فایل‌ها (${total})`, callback_data: 'fl:all' }]);
  rows.push([{ text: 'منوی اصلی', callback_data: 'm:home' }]);
  return { inline_keyboard: rows };
}

// Owner ingest: pick a category. `names` is the option list
// (existing categories + «سایر»); `selected` is the current pick.
export function categoryKeyboard(names, selected) {
  const rows = [];
  for (let i = 0; i < names.length; i += 2) {
    const row = names.slice(i, i + 2).map((n, j) => ({
      text: (n === selected ? '✓ ' : '') + n,
      callback_data: `db:cat:${i + j}`,
    }));
    rows.push(row);
  }
  rows.push([{ text: '➕ دسته جدید', callback_data: 'db:catnew' }]);
  rows.push([{ text: 'لغو', callback_data: 'db:cx' }]);
  return { inline_keyboard: rows };
}

// File view: download + version buttons + back to the file list.
export function fileKeyboard(file, versions) {
  const rows = [
    [{ text: '⬇️ دریافت', callback_data: `fl:dl:${file.id}:${file.version || 1}` }],
  ];
  if (versions.length > 1) {
    const verRow = versions.map((v) => ({
      text: v.version === (file.version || 1) ? `✓ v${v.version}` : `v${v.version}`,
      callback_data: `fl:ver:${file.id}:${v.version}`,
    }));
    rows.push(verRow);
  }
  rows.push([{ text: 'فایل‌ها', callback_data: 'm:files' }]);
  rows.push([{ text: 'منوی اصلی', callback_data: 'm:home' }]);
  return { inline_keyboard: rows };
}

// GitHub projects: one URL button per repo (max ~8 per screen).
export function projectsKeyboard(repos) {
  const rows = repos.slice(0, 10).map((r) => [
    { text: `${r.name} (${r.stars} ★)`, url: r.url },
  ]);
  rows.push([
    { text: '🔄 بروزرسانی', callback_data: 'gh:ref' },
    { text: 'منوی اصلی', callback_data: 'm:home' },
  ]);
  return { inline_keyboard: rows };
}

// Social links: one URL button per social.
export function socialsKeyboard(socials) {
  const rows = socials.map((s) => [{ text: s.label, url: s.url }]);
  rows.push([{ text: 'منوی اصلی', callback_data: 'm:home' }]);
  return { inline_keyboard: rows };
}

// Owner stats home: users list + files list.
export function statsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '👥 کاربران', callback_data: 'st:users:0' },
        { text: '📁 فایل‌ها', callback_data: 'st:files:0' },
      ],
      [{ text: 'منوی اصلی', callback_data: 'm:home' }],
    ],
  };
}

// Users list page: one row per user.
export function usersKeyboard(items, page, totalPages) {
  const rows = items.map((u) => [
    {
      text: `${u.username ? '@' + u.username : (u.first_name || u.user_id)}`.slice(0, 40),
      callback_data: `st:u:${u.user_id}`,
    },
  ]);
  const nav = [];
  if (page > 0) nav.push({ text: '‹ قبلی', callback_data: `st:users:${page - 1}` });
  if (page < totalPages - 1) {
    nav.push({ text: 'بعدی ›', callback_data: `st:users:${page + 1}` });
  }
  if (nav.length > 0) rows.push(nav);
  rows.push([{ text: '📊 آمار', callback_data: 'm:stats' }]);
  return { inline_keyboard: rows };
}

// Stats file list page: one row per file (taps show the same file view
// as users see it, without the download button).
export function statsFilesKeyboard(items, page, totalPages) {
  const rows = items.map((f) => [
    {
      text: `${f.id} — ${(f.title || '(بدون عنوان)').slice(0, 35)}`,
      callback_data: `st:f:${f.id}`,
    },
  ]);
  const nav = [];
  if (page > 0) nav.push({ text: '‹ قبلی', callback_data: `st:files:${page - 1}` });
  if (page < totalPages - 1) {
    nav.push({ text: 'بعدی ›', callback_data: `st:files:${page + 1}` });
  }
  if (nav.length > 0) rows.push(nav);
  rows.push([{ text: '📊 آمار', callback_data: 'm:stats' }]);
  return { inline_keyboard: rows };
}

// Yes/no confirmation (used by /del in the DB group).
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

// Cancel button shown while the bot waits for a text reply.
export function cancelInputKeyboard(cancelData) {
  return {
    inline_keyboard: [[{ text: 'لغو', callback_data: cancelData }]],
  };
}
