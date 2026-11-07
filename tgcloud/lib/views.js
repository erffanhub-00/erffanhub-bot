// Screen builders: every screen is one message ({ text, reply_markup })
// that the handlers show by deleting the previous screen and sending
// a fresh one at the bottom of the chat. No screen builder sends
// anything; the handlers own all api calls. Pure except for the data
// passed in.

import { paginate } from './pure.js';
import { truncate, formatTehran, formatFile, fileLine, formatBytes, formatToman } from './format.js';
import {
  mainMenu,
  backToMenu,
  joinKeyboard,
  filesKeyboard,
  categoryFilesKeyboard,
  categoriesKeyboard,
  categoryKeyboard,
  priceKeyboard,
  dbCancelKeyboard,
  fileKeyboard,
  projectsKeyboard,
  socialsKeyboard,
  statsKeyboard,
  usersKeyboard,
  userSearchKeyboard,
  userDetailKeyboard,
  statsFilesKeyboard,
  pagerKeyboard,
  walletKeyboard,
  chargeKeyboard,
  notifyConfirmKeyboard,
  notifyAudienceKeyboard,
  notifyFileKeyboard,
  dbKeyboard,
  confirmKeyboard,
  cancelInputKeyboard,
} from './keyboards.js';

export const PAGE_SIZE = 5;

export const HELP_TEXT =
  'دستورها:\n' +
  '/start — منوی اصلی\n' +
  '/projects — پروژه‌های گیت‌هاب\n' +
  '/socials — شبکه‌های اجتماعی\n' +
  '/files — فایل‌ها (اول دسته‌ها، بعد لیست فایل‌ها)\n' +
  '/get F001 — دیدن یک فایل با شناسه‌اش\n' +
  '/search — جستجو با نام فایل (عنوان، توضیح، دسته، نام فایل)\n' +
  '/wallet — کیف پول و شارژ\n' +
  '/support — پیام به پشتیبانی\n' +
  '/help — همین راهنما\n\n' +
  'برای استفاده از بات اول باید عضو کانال و گروه شوید.\n' +
  'فایل‌ها را با شناسه‌شان (مثل F001) یا از لیست فایل‌ها پیدا کنید.\n' +
  'فایل‌های پرمیوم (💰) با کیف پول خریده می‌شوند: کیف پول را با کارت‌به‌کارت شارژ کنید.\n' +
  'فایل‌های دریافتی بعد از ۱ دقیقه از چت پاک می‌شوند — تا قبلش ذخیره‌شان کنید.';

export function mainMenuView(owner, totalFiles, balance = 0) {
  const text =
    'به کتابخانه فایل‌های عرفان خوش آمدید.\n\n' +
    `فایل‌ها: ${totalFiles} مورد\n` +
    `💰 کیف پول: ${formatToman(balance)}\n` +
    'پروژه‌های گیت‌هاب، شبکه‌های اجتماعی و فایل‌ها از منوی زیر.';
  return { text, reply_markup: mainMenu(owner, balance) };
}

export function helpView() {
  return { text: HELP_TEXT, reply_markup: backToMenu() };
}

export function errorView(message) {
  return { text: message, reply_markup: backToMenu() };
}

// DB-group error: no main-menu button in a group — back just closes
// the screen.
export function dbErrorView(message) {
  return {
    text: message,
    reply_markup: { inline_keyboard: [[{ text: '◀ بازگشت', callback_data: 'db:cls' }]] },
  };
}

export function joinView(missing) {
  const lines = ['برای استفاده از بات، اول عضو شوید:', ''];
  if (missing.channel) lines.push('• کانال');
  if (missing.group) lines.push('• گروه');
  lines.push('');
  lines.push('بعد از عضویت، «بررسی عضویت» را بزنید.');
  return { text: lines.join('\n'), reply_markup: joinKeyboard(missing) };
}

export function projectsView(repos, cachedAt, liveFailed) {
  if (repos.length === 0) {
    return {
      text: 'فعلاً پروژه‌ای برای نمایش نیست.\n\nگیت‌هاب در دسترس نبود و نسخه ذخیره‌شده‌ای هم نیست.',
      reply_markup: backToMenu(),
    };
  }
  const lines = ['پروژه‌های گیت‌هاب:', ''];
  for (const r of repos) {
    lines.push(`• ${r.name}${r.language ? ` (${r.language})` : ''} — ${r.stars} ★`);
    if (r.description) lines.push('  ' + truncate(r.description, 150));
    lines.push('  ' + r.url);
    lines.push('');
  }
  if (liveFailed) {
    lines.push(
      `گیت‌هاب در دسترس نبود؛ این لیست ذخیره‌شده است${cachedAt ? ' (آخرین بروزرسانی: ' + formatTehran(cachedAt) + ')' : ''}.`,
    );
  } else if (cachedAt) {
    lines.push('آخرین بروزرسانی: ' + formatTehran(cachedAt));
  }
  return {
    text: truncate(lines.join('\n'), 4000),
    reply_markup: projectsKeyboard(repos),
  };
}

export function socialsView(socials) {
  const lines = ['شبکه‌های اجتماعی عرفان:', ''];
  for (const s of socials) lines.push(`• ${s.label}: ${s.url}`);
  return {
    text: lines.join('\n'),
    reply_markup: socialsKeyboard(socials),
  };
}

export function filesView(items, page, query, backData = 'm:home', dbMode = false) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  const head = query
    ? `جستجو: «${truncate(query, 40)}» — ${total} نتیجه`
    : `فایل‌ها — ${total} مورد`;
  if (total === 0) {
    return {
      text: head + '\n\nهنوز فایلی نیست.',
      reply_markup: dbMode
        ? { inline_keyboard: [[{ text: '◀ بازگشت', callback_data: 'db:cls' }]] }
        : backToMenu(),
    };
  }
  const lines = pageItems.map((f) => fileLine(f));
  const text =
    `${head} (صفحه ${safePage + 1} از ${totalPages})\n\n` + lines.join('\n');
  return {
    text: truncate(text, 4000),
    reply_markup: filesKeyboard(pageItems, safePage, totalPages, query ? 'sr' : 'fl', backData, { home: !dbMode }),
  };
}

// Files menu: categories first, then "all files".
export function categoriesView(categories, total) {
  if (total === 0) {
    return {
      text: 'هنوز فایلی نیست.',
      reply_markup: backToMenu(),
    };
  }
  const lines = ['فایل‌ها — دسته‌ها:', ''];
  for (const c of categories) lines.push(`• ${c.name} (${c.count})`);
  lines.push('');
  lines.push('یک دسته را انتخاب کن یا همه فایل‌ها را ببین.');
  return {
    text: truncate(lines.join('\n'), 4000),
    reply_markup: categoriesKeyboard(categories, total),
  };
}

// Files of one category, paginated.
export function categoryFilesView(items, page, catIndex, catName) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: `دسته «${catName}» خالی است.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '◀ بازگشت', callback_data: 'm:files' }],
          [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
        ],
      },
    };
  }
  const lines = pageItems.map((f) => fileLine(f));
  const text =
    `دسته «${catName}» — ${total} مورد (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    lines.join('\n');
  return {
    text: truncate(text, 4000),
    reply_markup: categoryFilesKeyboard(pageItems, safePage, totalPages, catIndex),
  };
}

export function fileView(file, parts, versions, downloadCount, balance = 0, opts = {}) {
  return {
    text: formatFile(file, parts, versions, downloadCount),
    reply_markup: fileKeyboard(file, versions, balance, opts),
  };
}

export function searchPromptView(note = '') {
  const head = note ? note + '\n' : '';
  return {
    text: head + 'نام فایل را بفرستید.\nدر عنوان، توضیح، دسته و نام فایل جستجو می‌شود.',
    reply_markup: cancelInputKeyboard('sr:cx'),
  };
}

// --- Wallet ---

export function walletView(balance, recentTxs = []) {
  const lines = [`💰 کیف پول: ${formatToman(balance)}`, ''];
  if (recentTxs.length === 0) {
    lines.push('هنوز تراکنشی نداری.');
  } else {
    lines.push('آخرین تراکنش‌ها:');
    for (const t of recentTxs.slice(0, 5)) lines.push('• ' + txLine(t));
  }
  return { text: lines.join('\n'), reply_markup: walletKeyboard() };
}

export function chargeView(cardNumber) {
  if (!cardNumber) {
    return {
      text: 'شماره کارت هنوز تنظیم نشده است.\nصاحب بات باید شماره کارت را در تنظیمات وارد کند.',
      reply_markup: walletKeyboard(),
    };
  }
  const text =
    'برای شارژ کیف پول، مبلغ را به این شماره کارت واریز کن:\n\n' +
    `${cardNumber}\n\n` +
    'بعد مبلغ را از دکمه‌های زیر انتخاب کن (یا مبلغ دلخواه را بزن) و عکس رسید را بفرست.';
  return { text, reply_markup: chargeKeyboard() };
}

export function chargeAmountView(amount) {
  return {
    text:
      `مبلغ شارژ: ${formatToman(amount)}\n\n` +
      'حالا عکس رسید پرداخت را بفرست.',
    reply_markup: cancelInputKeyboard('w:cx'),
  };
}

export function chargeCustomAmountView(note = '') {
  const head = note ? note + '\n' : '';
  return {
    text: head + 'مبلغ شارژ را به تومان بفرستید. مثال: 100000',
    reply_markup: cancelInputKeyboard('w:cx'),
  };
}

export function receiptSentView() {
  return {
    text: 'رسیدت ثبت شد ✅\nبعد از تایید صاحب بات، کیف پولت شارژ می‌شود و خبرت می‌کنم.',
    reply_markup: backToMenu(),
  };
}

// The user needs more money for a premium file.
export function premiumPayView(file, balance) {
  const price = Number(file.price) || 0;
  const text =
    'این فایل پرمیوم است 💰\n\n' +
    `قیمت: ${formatToman(price)}\n` +
    `موجودی تو: ${formatToman(balance)}\n` +
    `${formatToman(price - (Number(balance) || 0))} کم داری — اول کیف پولت را شارژ کن.`;
  return {
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 شارژ کیف پول', callback_data: 'w:charge' }],
        [{ text: '◀ بازگشت', callback_data: `fl:vw:${file.id}` }],
        [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
      ],
    },
  };
}

// One transaction line: "➕ ۱۰۰٬۰۰۰ تومان — شارژ — تایید شده — ۱۴۰۵/۰۸/۱۶".
// 'adjust' is the owner's manual balance fix.
export function txLine(t) {
  const amount = Number(t.amount) || 0;
  const sign = t.kind === 'purchase' || amount < 0 ? '➖' : '➕';
  const amountText = formatToman(Math.abs(amount));
  const kind =
    t.kind === 'purchase' ? 'خرید' : t.kind === 'adjust' ? 'تغییر دستی' : 'شارژ';
  const status =
    t.status === 'approved' ? 'تایید شده' : t.status === 'rejected' ? 'رد شده' : 'در انتظار';
  const file = t.file_id ? ` — ${t.file_id}` : '';
  return `${sign} ${amountText} — ${kind}${file} — ${status} — ${formatTehran(t.created_at)}`;
}

export function myTxView(items, page) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هنوز تراکنشی نداری.',
      reply_markup: pagerKeyboard(0, 1, 'w:tx', 'w:home'),
    };
  }
  const text =
    `تراکنش‌های من — ${total} مورد (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    pageItems.map((t) => '• ' + txLine(t)).join('\n');
  return {
    text: truncate(text, 4000),
    reply_markup: pagerKeyboard(safePage, totalPages, 'w:tx', 'w:home'),
  };
}

// --- Owner stats ---

export function statsView(s) {
  const lines = ['آمار شما:', ''];
  lines.push(`فایل‌ها: ${s.filesTotal} مورد (${s.partsTotal} پارت، ${formatBytes(s.sizeTotal)})`);
  lines.push(`دانلودها: ${s.downloadsTotal} بار`);
  lines.push(`کاربران: ${s.usersTotal} نفر (امروز ${s.usersToday}، این هفته ${s.usersWeek})`);
  lines.push(`💰 شارژها: ${formatToman(s.totalCharged || 0)}`);
  lines.push(`🛒 خریدها: ${formatToman(s.totalPurchased || 0)}`);
  lines.push(`🧾 رسیدهای در انتظار: ${s.pendingReceipts || 0} مورد`);
  lines.push('');
  lines.push('برای جزئیات، کاربران یا فایل‌ها را باز کنید.');
  return { text: lines.join('\n'), reply_markup: statsKeyboard() };
}

export function statsUsersView(items, page) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هنوز کاربری ثبت نشده است.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '◀ بازگشت', callback_data: 'm:stats' }],
          [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
        ],
      },
    };
  }
  const lines = pageItems.map((u) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
    const handle = u.username ? '@' + u.username : '—';
    const member = u.is_member === 1 ? 'عضو' : u.is_member === 0 ? 'غیرعضو' : '؟';
    return `${handle} — ${name}\n  دانلود: ${u.downloads} | ${member} | آخرین فعالیت: ${formatTehran(u.last_seen)}`;
  });
  const text =
    `کاربران — ${total} نفر (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    lines.join('\n\n');
  return {
    text: truncate(text, 4000),
    reply_markup: usersKeyboard(pageItems, safePage, totalPages),
  };
}

export function statsUserView(user, history) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || '—';
  const lines = [
    `${user.username ? '@' + user.username : '—'} — ${name}`,
    '',
    `آیدی: ${user.user_id}`,
    `زبان: ${user.language_code || '—'}`,
    `پرمیوم: ${user.is_premium ? 'بله' : 'خیر'}`,
    `شماره: ${user.phone || '—'}`,
    `💰 کیف پول: ${formatToman(user.balance || 0)}`,
    `عضویت: ${user.is_member === 1 ? 'عضو' : user.is_member === 0 ? 'غیرعضو' : 'نامشخص'}`,
    `اولین بازدید: ${formatTehran(user.first_seen)}`,
    `آخرین فعالیت: ${formatTehran(user.last_seen)}`,
    `دانلودها: ${history.length} بار`,
  ];
  if (history.length > 0) {
    lines.push('');
    lines.push('آخرین دانلودها:');
    for (const h of history.slice(0, 10)) {
      lines.push(`• ${h.file_id} v${h.version} — ${formatTehran(h.downloaded_at)}`);
    }
  }
  return {
    text: truncate(lines.join('\n'), 4000),
    reply_markup: userDetailKeyboard(user.user_id),
  };
}

export function statsFilesView(items, page, perFile) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هنوز فایلی نیست.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '◀ بازگشت', callback_data: 'm:stats' }],
          [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
        ],
      },
    };
  }
  const lines = pageItems.map((f) => {
    const agg = perFile[f.id] || { count: 0, lastAt: 0 };
    return `${fileLine(f)}\n  دانلود: ${agg.count} | آخرین دانلود: ${agg.lastAt ? formatTehran(agg.lastAt) : '—'}`;
  });
  const text =
    `فایل‌ها — ${total} مورد (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    lines.join('\n\n');
  return {
    text: truncate(text, 4000),
    reply_markup: statsFilesKeyboard(pageItems, safePage, totalPages),
  };
}

export function statsFileView(file, parts, versions, downloadCount) {
  return {
    text: formatFile(file, parts, versions, downloadCount),
    reply_markup: {
      inline_keyboard: [
        [{ text: '◀ بازگشت', callback_data: 'st:files:0' }],
        [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
      ],
    },
  };
}

// Owner transactions (all users), newest first.
export function ownerTxView(items, page) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هنوز تراکنشی ثبت نشده است.',
      reply_markup: pagerKeyboard(0, 1, 'st:tx', 'm:stats'),
    };
  }
  const text =
    `تراکنش‌ها — ${total} مورد (صفحه ${safePage + 1} از ${totalPages})\n\n` +
    pageItems
      .map((t) => `• ${t.username ? '@' + t.username : t.user_id} — ` + txLine(t))
      .join('\n');
  return {
    text: truncate(text, 4000),
    reply_markup: pagerKeyboard(safePage, totalPages, 'st:tx', 'm:stats'),
  };
}

export function userSearchPromptView(note = '') {
  const head = note ? note + '\n' : '';
  return {
    text: head + 'نام، یوزرنیم یا آیدی کاربر را بفرستید.',
    reply_markup: cancelInputKeyboard('st:usx'),
  };
}

export function userSearchResultsView(items, page, query) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  const head = `جستجوی کاربر: «${truncate(query, 40)}» — ${total} نتیجه`;
  if (total === 0) {
    return {
      text: head + '\n\nکاربری پیدا نشد.',
      reply_markup: pagerKeyboard(0, 1, 'st:ures', 'm:stats'),
    };
  }
  const lines = pageItems.map((u) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
    const handle = u.username ? '@' + u.username : '—';
    return `${handle} — ${name} (آیدی: ${u.user_id})`;
  });
  const text =
    `${head} (صفحه ${safePage + 1} از ${totalPages})\n\n` + lines.join('\n');
  return {
    text: truncate(text, 4000),
    reply_markup: userSearchKeyboard(pageItems, safePage, totalPages),
  };
}

export function notifyPromptView(note = '', audience = 'همه کاربران') {
  const head = note ? note + '\n' : '';
  return {
    text: head + `متن اطلاع‌رسانی را بفرستید.\nبه ${audience} ارسال می‌شود.`,
    reply_markup: cancelInputKeyboard('st:nfx'),
  };
}

// Notify audience picker (owner, from the main menu): everyone, one
// file's downloaders, or one user. `note` is an optional result line
// shown on top (e.g. after a message was sent).
export function notifyAudienceView(note = '') {
  const head = note ? note + '\n\n' : '';
  return {
    text:
      head +
      'اطلاع‌رسانی به چه کسی؟\n\n' +
      '• همه کاربران — پیام به همه کسانی که بات را باز کرده‌اند\n' +
      '• کاربران یک فایل — فقط کسانی که آن فایل را دانلود کرده‌اند\n' +
      '• یک کاربر — اول کاربر را پیدا می‌کنید، بعد پیام را می‌فرستید',
    reply_markup: notifyAudienceKeyboard(),
  };
}

// File picker for the "users of one file" audience.
export function notifyFilePickerView(items, page) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هنوز فایلی نیست.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '◀ بازگشت', callback_data: 'm:notify' }],
          [{ text: '🏠 منوی اصلی', callback_data: 'm:home' }],
        ],
      },
    };
  }
  const lines = pageItems.map((f) => fileLine(f));
  const text =
    `کاربران کدام فایل؟ (صفحه ${safePage + 1} از ${totalPages})\n\n` + lines.join('\n');
  return {
    text: truncate(text, 4000),
    reply_markup: notifyFileKeyboard(pageItems, safePage, totalPages),
  };
}

// Support: the user writes one message (text, photo or file) for the
// owner. It is forwarded to the owner, who answers from the reply
// button on it.
export function supportPromptView(note = '') {
  const head = note ? note + '\n' : '';
  return {
    text:
      head +
      'پیامت به پشتیبانی را بفرست — متن، عکس یا فایل.\nصاحب بات جوابت را همین‌جا می‌دهد.',
    reply_markup: cancelInputKeyboard('sp:cx'),
  };
}

// Owner manual balance fix: show the current balance, ask for the new
// one. The change is written to the ledger as a manual adjustment.
export function balancePromptView(user, note = '') {
  const head = note ? note + '\n' : '';
  const who = user.username ? '@' + user.username : `کاربر ${user.user_id}`;
  return {
    text:
      head +
      `موجودی ${who}: ${formatToman(user.balance || 0)}\n\n` +
      'موجودی جدید را به تومان بفرستید. مثال: 100000\n(صفر یعنی خالی)',
    reply_markup: cancelInputKeyboard(`st:u:${user.user_id}`),
  };
}

// Database management (owner only): row counts per table, backup and
// cleanup actions. Files, users, balances and the money ledger are
// never wiped from here — files are deleted one by one (/del),
// balances are fixed from the user screen.
export function dbView(counts) {
  const c = counts || {};
  const lines = [
    '🗄️ مدیریت دیتابیس',
    '',
    `فایل‌ها: ${c.files ?? '—'} مورد (${c.file_parts ?? '—'} پارت، ${c.file_versions ?? '—'} ورژن)`,
    `دانلودها: ${c.downloads ?? '—'} مورد`,
    `کاربران: ${c.users ?? '—'} نفر`,
    `تراکنش‌ها: ${c.wallet_transactions ?? '—'} مورد`,
    `کش گیت‌هاب: ${c.github_cache ?? '—'} ردیف`,
    `پیام‌های در انتظار حذف: ${c.expiring_messages ?? '—'} مورد`,
    '',
    'پشتیبان (JSON) همه جدول‌ها را یک‌جا دانلود می‌کند.',
  ];
  return { text: lines.join('\n'), reply_markup: dbKeyboard() };
}

export function notifyConfirmView(count, text) {
  return {
    text:
      `این پیام به ${count} کاربر ارسال شود؟\n\n` +
      '— — —\n' +
      truncate(text, 1000) +
      '\n— — —',
    reply_markup: notifyConfirmKeyboard(count),
  };
}

export function notifyUserPromptView(user, note = '') {
  const head = note ? note + '\n' : '';
  const who = user.username ? '@' + user.username : `کاربر ${user.user_id}`;
  return {
    text: head + `پیام به ${who} را بفرستید.`,
    reply_markup: cancelInputKeyboard(`st:u:${user.user_id}`),
  };
}

export function confirmDeleteView(file) {
  return {
    text: `فایل ${file.id} «${file.title || '(بدون عنوان)'}» حذف شود؟\nهمه پارت‌ها و ورژن‌هایش پاک می‌شوند. پیام‌های گروه دیتابیس دست نمی‌خورند.`,
    reply_markup: confirmKeyboard(`db:dy:${file.id}`, 'db:dn'),
  };
}

export function promptTitleView(categoryNames, selected, isBundle) {
  const lines = [
    `فایل${isBundle ? ' (بسته چندپارتی)' : ''} دریافت شد.`,
    '',
    'عنوان را در خط اول و توضیح را در خط‌های بعد، در یک پیام بفرستید.',
    '',
    `دسته: ${selected || 'سایر'} — اگر دسته دیگری می‌خواهید، از دکمه‌های زیر انتخاب کنید یا «دسته جدید» را بزنید.`,
  ];
  return {
    text: lines.join('\n'),
    reply_markup: categoryKeyboard(categoryNames, selected || 'سایر'),
  };
}

// Owner ingest: free or premium? Asked after the title is received.
export function pricePromptView(title) {
  return {
    text:
      `فایل «${truncate(title || '(بدون عنوان)', 60)}»\n\n` +
      'رایگان باشد یا پرمیوم؟\nاگر پرمیوم است، بعد قیمت را به تومان می‌دهید.',
    reply_markup: priceKeyboard(),
  };
}

export function priceAmountPromptView(note = '') {
  const head = note ? note + '\n' : '';
  return {
    text: head + 'قیمت فایل را به تومان بفرستید. مثال: 50000\n(صفر یعنی رایگان)',
    reply_markup: dbCancelKeyboard(),
  };
}

export function titleSavedView(file) {
  const lines = [
    `✅ ثبت شد — ${file.id}`,
    '',
    `عنوان: ${file.title || '(بدون عنوان)'}`,
    `نسخه: v${file.version || 1}`,
    `نوع: ${file.kind || '—'}`,
    `پارت‌ها: ${file.parts_count || 1}`,
  ];
  if (file.size_total) lines.push(`حجم: ${formatBytes(file.size_total)}`);
  lines.push(
    (Number(file.price) || 0) > 0
      ? `قیمت: ${formatToman(file.price)} (پرمیوم)`
      : 'قیمت: رایگان',
  );
  if (file.description) lines.push('', file.description);
  return { text: lines.join('\n') };
}
