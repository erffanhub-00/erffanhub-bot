// Persian inline keyboards. Every screen ends the same way: its
// content rows, then a pager row when paging, then a generic
// «◀ بازگشت» row, then «🏠 منوی اصلی». Buttons carry short callback
// data (64-byte limit).

import { CHANNEL_URL, GROUP_URL } from './config.js';
import { formatToman } from './pure.js';

// Append the standard bottom rows: generic back, then main menu.
// `backData` null skips the back row (top-level screens). `home`
// false skips the home row (DB-group screens have no main menu).
function navRows(rows, backData, { home = true } = {}) {
  if (backData) rows.push([{ text: '◀ بازگشت', callback_data: backData }]);
  if (home) rows.push([{ text: '🏠 منوی اصلی', callback_data: 'm:home' }]);
  return rows;
}

// Pager row for a list: «◀ قبلی | بعدی ▶». `prefix` already holds
// the action (e.g. 'fl:pg', 'st:users'), the page number is appended.
function pagerRow(rows, page, totalPages, prefix) {
  const nav = [];
  if (page > 0) nav.push({ text: '◀ قبلی', callback_data: `${prefix}:${page - 1}` });
  if (page < totalPages - 1) nav.push({ text: 'بعدی ▶', callback_data: `${prefix}:${page + 1}` });
  if (nav.length > 0) rows.push(nav);
  return rows;
}

// Main menu. The owner also gets the stats button. The wallet balance
// is always visible here.
export function mainMenu(owner, balance) {
  const rows = [
    [
      { text: '📦 پروژه‌های گیت‌هاب', callback_data: 'm:projects' },
      { text: '🔗 شبکه‌های اجتماعی', callback_data: 'm:socials' },
    ],
    [
      { text: '📁 فایل‌ها', callback_data: 'm:files' },
      { text: '🔍 جستجو', callback_data: 'm:search' },
    ],
    [{ text: `💰 کیف پول: ${formatToman(balance || 0)}`, callback_data: 'w:home' }],
  ];
  if (owner) rows.push([{ text: '📊 آمار من', callback_data: 'm:stats' }]);
  rows.push([{ text: 'راهنما', callback_data: 'm:help' }]);
  return { inline_keyboard: rows };
}

export function backToMenu() {
  return {
    inline_keyboard: [[{ text: '🏠 منوی اصلی', callback_data: 'm:home' }]],
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

// File list page: one row per file (premium files carry a 💰 mark).
// `backData` is the back button target ('m:home' by default, 'm:files'
// from a category list, 'db:cls' for the DB-group list).
export function filesKeyboard(items, page, totalPages, prefix, backData = 'm:home', { home = true } = {}) {
  const rows = items.map((item) => [
    {
      text: `${item.id} — ${(item.title || '(بدون عنوان)').slice(0, 35)}${(Number(item.price) || 0) > 0 ? ' 💰' : ''}`,
      callback_data: `fl:vw:${item.id}`,
    },
  ]);
  pagerRow(rows, page, totalPages, `${prefix}:pg`);
  return { inline_keyboard: navRows(rows, backData, { home }) };
}

// Category file list page: paging keeps the category index.
export function categoryFilesKeyboard(items, page, totalPages, catIndex) {
  const rows = items.map((item) => [
    {
      text: `${item.id} — ${(item.title || '(بدون عنوان)').slice(0, 35)}${(Number(item.price) || 0) > 0 ? ' 💰' : ''}`,
      callback_data: `fl:vw:${item.id}`,
    },
  ]);
  pagerRow(rows, page, totalPages, `fc:pg:${catIndex}`);
  return { inline_keyboard: navRows(rows, 'm:files') };
}

// Files menu: categories with counts + "all files". `categories` is
// [{ name, count }]; indices are resolved live from the same ordering.
export function categoriesKeyboard(categories, total) {
  const rows = categories.map((c, i) => [
    { text: `${c.name} (${c.count})`, callback_data: `fl:cat:${i}` },
  ]);
  rows.push([{ text: `همه فایل‌ها (${total})`, callback_data: 'fl:all' }]);
  return { inline_keyboard: navRows(rows, null) };
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

// Owner ingest: free or premium? Shown after the title is received.
export function priceKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🆓 رایگان', callback_data: 'db:free' },
        { text: '💰 پرمیوم', callback_data: 'db:prem' },
      ],
      [{ text: 'لغو', callback_data: 'db:cx' }],
    ],
  };
}

// Cancel button for a DB-group text prompt (no main-menu row: groups
// have no menu).
export function dbCancelKeyboard() {
  return {
    inline_keyboard: [[{ text: 'لغو', callback_data: 'db:cx' }]],
  };
}

// File view: download + version buttons + wallet + back + home.
// Premium files show their price on the download button. In the DB
// group (`db: true`) the wallet row and the home row are dropped and
// back just closes the screen (owner preview is free).
export function fileKeyboard(file, versions, balance, { db = false } = {}) {
  const price = Number(file.price) || 0;
  const rows = [
    [
      {
        text: price > 0 ? `⬇️ دریافت — ${formatToman(price)}` : '⬇️ دریافت',
        callback_data: `fl:dl:${file.id}:${file.version || 1}`,
      },
    ],
  ];
  if (versions.length > 1) {
    const verRow = versions.map((v) => ({
      text: v.version === (file.version || 1) ? `✓ v${v.version}` : `v${v.version}`,
      callback_data: `fl:ver:${file.id}:${v.version}`,
    }));
    rows.push(verRow);
  }
  if (!db) rows.push([{ text: `💰 کیف پول: ${formatToman(balance || 0)}`, callback_data: 'w:home' }]);
  return { inline_keyboard: navRows(rows, db ? 'db:cls' : 'm:files', { home: !db }) };
}

// GitHub projects: one URL button per repo (max ~8 per screen).
export function projectsKeyboard(repos) {
  const rows = repos.slice(0, 10).map((r) => [
    { text: `${r.name} (${r.stars} ★)`, url: r.url },
  ]);
  rows.push([
    { text: '🔄 بروزرسانی', callback_data: 'gh:ref' },
    { text: '🏠 منوی اصلی', callback_data: 'm:home' },
  ]);
  return { inline_keyboard: rows };
}

// Social links: one URL button per social.
export function socialsKeyboard(socials) {
  const rows = socials.map((s) => [{ text: s.label, url: s.url }]);
  return { inline_keyboard: navRows(rows, null) };
}

// Owner stats home: users, files, user search, transactions, notify.
export function statsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '👥 کاربران', callback_data: 'st:users:0' },
        { text: '📁 فایل‌ها', callback_data: 'st:files:0' },
      ],
      [
        { text: '🔍 جستجوی کاربر', callback_data: 'st:usearch' },
        { text: '🧾 تراکنش‌ها', callback_data: 'st:tx:0' },
      ],
      [{ text: '📣 اطلاع‌رسانی به همه', callback_data: 'st:notify' }],
      [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
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
  pagerRow(rows, page, totalPages, 'st:users');
  return { inline_keyboard: navRows(rows, 'm:stats') };
}

// User search results: one row per match, paging keeps the stored query.
export function userSearchKeyboard(items, page, totalPages) {
  const rows = items.map((u) => [
    {
      text: `${u.username ? '@' + u.username : (u.first_name || u.user_id)}`.slice(0, 40),
      callback_data: `st:u:${u.user_id}`,
    },
  ]);
  pagerRow(rows, page, totalPages, 'st:ures');
  return { inline_keyboard: navRows(rows, 'm:stats') };
}

// Owner user detail: message this user, back to users, home.
export function userDetailKeyboard(userId) {
  return {
    inline_keyboard: [
      [{ text: '📩 پیام به این کاربر', callback_data: `st:msg:${userId}` }],
      [{ text: '◀ بازگشت', callback_data: 'st:users:0' }],
      [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
    ],
  };
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
  pagerRow(rows, page, totalPages, 'st:files');
  return { inline_keyboard: navRows(rows, 'm:stats') };
}

// Generic pager-only keyboard: pager row + back + home. Used by the
// transaction lists, which need no per-row buttons.
export function pagerKeyboard(page, totalPages, prefix, backData) {
  const rows = [];
  pagerRow(rows, page, totalPages, prefix);
  return { inline_keyboard: navRows(rows, backData) };
}

// Wallet home: top-up + my transactions.
export function walletKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '💳 شارژ کیف پول', callback_data: 'w:charge' }],
      [{ text: '🧾 تراکنش‌های من', callback_data: 'w:tx:0' }],
      [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
    ],
  };
}

// Top-up: preset amounts + custom amount.
export function chargeKeyboard() {
  const presets = [50000, 100000, 200000, 500000];
  const rows = [];
  for (let i = 0; i < presets.length; i += 2) {
    rows.push(
      presets.slice(i, i + 2).map((a) => ({
        text: formatToman(a),
        callback_data: `w:amt:${a}`,
      })),
    );
  }
  rows.push([{ text: 'مبلغ دلخواه', callback_data: 'w:amtc' }]);
  return { inline_keyboard: navRows(rows, 'w:home') };
}

// Receipt approve / reject (receipts group, owner only). `mid` is the
// receipts-group message id — the transaction is found by it.
export function receiptKeyboard(mid) {
  return {
    inline_keyboard: [[
      { text: '✅ تایید', callback_data: `rx:ok:${mid}` },
      { text: '❌ رد', callback_data: `rx:no:${mid}` },
    ]],
  };
}

// Broadcast confirm: send to every user, or cancel.
export function notifyConfirmKeyboard(count) {
  return {
    inline_keyboard: [
      [{ text: `✅ ارسال به ${count} کاربر`, callback_data: 'st:nfy:yes' }],
      [{ text: 'لغو', callback_data: 'st:nfy:no' }],
    ],
  };
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

// Cancel button shown while the bot waits for a text reply, plus the
// always-present main-menu button.
export function cancelInputKeyboard(cancelData) {
  return {
    inline_keyboard: [
      [{ text: 'لغو', callback_data: cancelData }],
      [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
    ],
  };
}
