// Screen builders: every screen is one message ({ text, reply_markup })
// that the handlers edit in place. No screen builder sends anything;
// the handlers own all api calls. Pure except for the data passed in.

import { paginate } from './pure.js';
import { truncate, formatTehran, formatFile, fileLine, formatBytes } from './format.js';
import {
  mainMenu,
  backToMenu,
  joinKeyboard,
  filesKeyboard,
  categoryFilesKeyboard,
  categoriesKeyboard,
  categoryKeyboard,
  fileKeyboard,
  projectsKeyboard,
  socialsKeyboard,
  statsKeyboard,
  usersKeyboard,
  statsFilesKeyboard,
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
  '/id — آیدی این چت و آیدی شما\n' +
  '/help — همین راهنما\n\n' +
  'برای استفاده از بات اول باید عضو کانال و گروه شوید.\n' +
  'فایل‌ها را با شناسه‌شان (مثل F001) یا از لیست فایل‌ها پیدا کنید.';

export function mainMenuView(owner, totalFiles) {
  const text =
    'به کتابخانه فایل‌های عرفان خوش آمدید.\n\n' +
    `فایل‌ها: ${totalFiles} مورد\n` +
    'پروژه‌های گیت‌هاب، شبکه‌های اجتماعی و فایل‌ها از منوی زیر.';
  return { text, reply_markup: mainMenu(owner) };
}

export function helpView() {
  return { text: HELP_TEXT, reply_markup: backToMenu() };
}

export function errorView(message) {
  return { text: message, reply_markup: backToMenu() };
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

export function filesView(items, page, query, backData = 'm:home') {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  const head = query
    ? `جستجو: «${truncate(query, 40)}» — ${total} نتیجه`
    : `فایل‌ها — ${total} مورد`;
  if (total === 0) {
    return {
      text: head + '\n\nهنوز فایلی نیست.' + (query ? '' : ''),
      reply_markup: backToMenu(),
    };
  }
  const lines = pageItems.map((f) => fileLine(f));
  const text =
    `${head} (صفحه ${safePage + 1} از ${totalPages})\n\n` + lines.join('\n');
  return {
    text: truncate(text, 4000),
    reply_markup: filesKeyboard(pageItems, safePage, totalPages, query ? 'sr' : 'fl', backData),
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
        inline_keyboard: [[{ text: 'دسته‌ها', callback_data: 'm:files' }]],
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

export function fileView(file, parts, versions, downloadCount) {
  return {
    text: formatFile(file, parts, versions, downloadCount),
    reply_markup: fileKeyboard(file, versions),
  };
}

export function searchPromptView(note = '') {
  const head = note ? note + '\n' : '';
  return {
    text: head + 'نام فایل را بفرستید.\nدر عنوان، توضیح، دسته و نام فایل جستجو می‌شود.',
    reply_markup: cancelInputKeyboard('sr:cx'),
  };
}

export function statsView(s) {
  const lines = ['آمار شما:', ''];
  lines.push(`فایل‌ها: ${s.filesTotal} مورد (${s.partsTotal} پارت، ${formatBytes(s.sizeTotal)})`);
  lines.push(`دانلودها: ${s.downloadsTotal} بار`);
  lines.push(`کاربران: ${s.usersTotal} نفر (امروز ${s.usersToday}، این هفته ${s.usersWeek})`);
  lines.push('');
  lines.push('برای جزئیات، کاربران یا فایل‌ها را باز کنید.');
  return { text: lines.join('\n'), reply_markup: statsKeyboard() };
}

export function statsUsersView(items, page) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هنوز کاربری ثبت نشده است.',
      reply_markup: { inline_keyboard: [[{ text: '📊 آمار', callback_data: 'm:stats' }]] },
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
    reply_markup: {
      inline_keyboard: [[{ text: '👥 کاربران', callback_data: 'st:users:0' }]],
    },
  };
}

export function statsFilesView(items, page, perFile) {
  const { pageItems, page: safePage, totalPages, total } = paginate(items, page, PAGE_SIZE);
  if (total === 0) {
    return {
      text: 'هنوز فایلی نیست.',
      reply_markup: { inline_keyboard: [[{ text: '📊 آمار', callback_data: 'm:stats' }]] },
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
      inline_keyboard: [[{ text: '📁 فایل‌ها', callback_data: 'st:files:0' }]],
    },
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
  if (file.description) lines.push('', file.description);
  return { text: lines.join('\n') };
}
