import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOwner } from '../tgcloud/lib/auth.js';
import { persistentKeyboard, MENU_LABELS, joinKeyboard } from '../tgcloud/lib/keyboards.js';
import {
  mainMenuView,
  fileView,
  filesView,
  categoriesView,
  categoryFilesView,
  statsView,
  statsUserView,
  searchPromptView,
  promptTitleView,
  walletView,
  chargeView,
  userSearchResultsView,
  notifyAudienceView,
  notifyFilePickerView,
  supportPromptView,
  balancePromptView,
  dbView,
} from '../tgcloud/lib/views.js';

test('owner gate: isOwner refuses everyone while the owner id is unset (0)', () => {
  assert.equal(isOwner(123), false);
  assert.equal(isOwner(0), false);
  assert.equal(isOwner(null), false);
  assert.equal(isOwner(undefined), false);
});

test('main menu shows the stats button only to the owner', () => {
  const ownerKb = persistentKeyboard(true).keyboard.flat();
  const userKb = persistentKeyboard(false).keyboard.flat();
  assert.ok(ownerKb.some((b) => b.text === MENU_LABELS.stats));
  assert.ok(!userKb.some((b) => b.text === MENU_LABELS.stats));
});

test('persistent keyboard carries every menu label for the owner', () => {
  const buttons = persistentKeyboard(true).keyboard.flat().map((b) => b.text);
  for (const label of Object.values(MENU_LABELS)) {
    assert.ok(buttons.includes(label), `missing menu button: ${label}`);
  }
  const kb = persistentKeyboard(true);
  assert.equal(kb.resize_keyboard, true);
  assert.equal(kb.is_persistent, true);
});

test('join keyboard offers join links and a membership check button', () => {
  const kb = joinKeyboard({ channel: true, group: true }).inline_keyboard.flat();
  assert.ok(kb.some((b) => b.callback_data === 'm:check'));
  // URLs come from config (placeholders in the repo), so only the
  // check button is guaranteed here; the shape is what matters.
  assert.ok(Array.isArray(joinKeyboard({ channel: false, group: false }).inline_keyboard));
});

test('file view shows the title, the original file name AND the category', () => {
  const file = {
    id: 'F025',
    title: 'پرامپت میدجرنی',
    description: 'عکس حرفه‌ای',
    category: 'پرامپت',
    version: 2,
    kind: 'document',
    size_total: 1234,
    parts_count: 1,
    created_at: Date.UTC(2026, 10, 7, 12, 0, 0),
  };
  const parts = [
    { file_name: 'پرامپت ویژه (نسخه ۱).txt', kind: 'document' },
  ];
  const view = fileView(file, parts, [{ version: 1 }, { version: 2 }], 7);
  assert.match(view.text, /F025 — پرامپت میدجرنی/);
  assert.match(view.text, /نام فایل: پرامپت ویژه \(نسخه ۱\)\.txt/);
  assert.match(view.text, /دسته: پرامپت/);
  assert.match(view.text, /نسخه: v2 \(از 2 نسخه\)/);
  assert.match(view.text, /دانلودها: 7/);
  // Version buttons for v1 and v2.
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'fl:ver:F025:1'));
  assert.ok(buttons.some((b) => b.callback_data === 'fl:ver:F025:2'));
  assert.ok(buttons.some((b) => b.callback_data === 'fl:dl:F025:2'));
});

test('file view with a single version has no version buttons', () => {
  const file = { id: 'F001', title: 'X', version: 1, kind: 'photo', size_total: 100, parts_count: 1 };
  const view = fileView(file, [{ file_name: 'photo_x.jpg' }], [{ version: 1 }], 0);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(!buttons.some((b) => String(b.callback_data || '').startsWith('fl:ver:')));
  assert.ok(buttons.some((b) => b.callback_data === 'fl:dl:F001:1'));
});

test('file view lists every part file name for a multi-part bundle', () => {
  const file = { id: 'F003', title: 'بسته', version: 1, kind: 'document', size_total: 3000, parts_count: 3 };
  const parts = [
    { file_name: 'part1.zip' },
    { file_name: 'part2.zip' },
    { file_name: 'part3.zip' },
  ];
  const view = fileView(file, parts, [{ version: 1 }], 0);
  assert.match(view.text, /نام فایل‌ها:/);
  assert.match(view.text, /1\. part1\.zip/);
  assert.match(view.text, /3\. part3\.zip/);
});

test('categories view lists categories with counts plus all files', () => {
  const view = categoriesView(
    [
      { name: 'پرامپت', count: 3 },
      { name: 'عکس', count: 1 },
    ],
    4,
  );
  assert.match(view.text, /پرامپت \(3\)/);
  assert.match(view.text, /عکس \(1\)/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'fl:cat:0'));
  assert.ok(buttons.some((b) => b.callback_data === 'fl:cat:1'));
  assert.ok(buttons.some((b) => b.callback_data === 'fl:all'));
  assert.ok(buttons.some((b) => b.text.includes('همه فایل‌ها (4)')));
  const empty = categoriesView([], 0);
  assert.match(empty.text, /هنوز فایلی نیست/);
});

test('category files view pages inside one category and goes back to categories', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({
    id: 'F' + String(i + 1).padStart(3, '0'),
    title: 'فایل ' + (i + 1),
    version: 1,
    parts_count: 1,
  }));
  const view = categoryFilesView(items, 1, 0, 'پرامپت');
  assert.match(view.text, /دسته «پرامپت» — 7 مورد \(صفحه 2 از 2\)/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'fc:pg:0:0'));
  assert.ok(buttons.some((b) => b.callback_data === 'm:files'));
});

test('files list is paginated at 5 per page', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({
    id: 'F' + String(i + 1).padStart(3, '0'),
    title: 'فایل ' + (i + 1),
    version: 1,
    parts_count: 1,
  }));
  const first = filesView(items, 0, null);
  assert.match(first.text, /صفحه 1 از 3/);
  const last = filesView(items, 2, null);
  assert.match(last.text, /صفحه 3 از 3/);
  const empty = filesView([], 0, null);
  assert.match(empty.text, /هنوز فایلی نیست/);
});

test('stats view has both sections: files and users', () => {
  const view = statsView({
    filesTotal: 4,
    partsTotal: 6,
    sizeTotal: 2048,
    downloadsTotal: 9,
    usersTotal: 12,
    usersToday: 2,
    usersWeek: 5,
  });
  assert.match(view.text, /فایل‌ها: 4 مورد/);
  assert.match(view.text, /دانلودها: 9 بار/);
  assert.match(view.text, /کاربران: 12 نفر \(امروز 2، این هفته 5\)/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'st:users:0'));
  assert.ok(buttons.some((b) => b.callback_data === 'st:files:0'));
});

test('search prompt says the search covers the name', () => {
  const view = searchPromptView();
  assert.match(view.text, /نام فایل را بفرستید/);
  assert.match(view.text, /عنوان، توضیح، دسته و نام فایل/);
});

test('title prompt asks for title, description and category — never a number', () => {
  const view = promptTitleView(['پرامپت', 'عکس', 'سایر'], 'سایر', false);
  assert.match(view.text, /عنوان را در خط اول/);
  assert.match(view.text, /دسته: سایر/);
  assert.doesNotMatch(view.text, /#/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'db:cat:0' && b.text === 'پرامپت'));
  assert.ok(buttons.some((b) => b.text === '✓ سایر'));
  assert.ok(buttons.some((b) => b.callback_data === 'db:catnew'));
  assert.ok(buttons.some((b) => b.callback_data === 'db:cx'));
});

test('user stats detail shows the phone only to the owner', () => {
  const view = statsUserView(
    {
      user_id: 123,
      username: 'someone',
      first_name: 'Ali',
      last_name: null,
      language_code: 'fa',
      is_premium: 1,
      phone: '+989121234567',
      is_member: 1,
      first_seen: Date.UTC(2026, 10, 1, 10, 0, 0),
      last_seen: Date.UTC(2026, 10, 7, 10, 0, 0),
    },
    [{ file_id: 'F001', version: 1, downloaded_at: Date.UTC(2026, 10, 7, 9, 0, 0) }],
  );
  assert.match(view.text, /شماره: \+989121234567/);
  assert.match(view.text, /دانلودها: 1 بار/);
  const noPhone = statsUserView(
    { user_id: 124, username: null, first_name: 'Sara', phone: null, is_member: 0, first_seen: 1, last_seen: 2 },
    [],
  );
  assert.match(noPhone.text, /شماره: —/);
});

test('main menu view greets and shows the file count', () => {
  const view = mainMenuView(false, 3);
  assert.match(view.text, /فایل‌ها: 3 مورد/);
});

test('main menu shows the wallet balance and a wallet button', () => {
  const view = mainMenuView(false, 3, 12000);
  assert.match(view.text, /کیف پول: ۱۲٬۰۰۰ تومان/);
  const buttons = view.reply_markup.keyboard.flat();
  assert.ok(buttons.some((b) => b.text === MENU_LABELS.wallet));
  assert.equal(view.reply_markup.is_persistent, true);
});

test('file view shows the premium price and the price on the download button', () => {
  const file = { id: 'F010', title: 'پرامپت ویژه', version: 1, kind: 'document', size_total: 100, parts_count: 1, price: 50000 };
  const view = fileView(file, [{ file_name: 'prompt.txt' }], [{ version: 1 }], 0, 20000);
  assert.match(view.text, /قیمت: ۵۰٬۰۰۰ تومان \(پرمیوم\)/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'fl:dl:F010:1' && b.text.includes('۵۰٬۰۰۰')));
  assert.ok(buttons.some((b) => b.callback_data === 'w:home'));
  assert.ok(buttons.some((b) => b.text === '◀ بازگشت'));
  assert.ok(buttons.some((b) => b.callback_data === 'm:home'));
});

test('file view of a free file says رایگان and has a plain download button', () => {
  const file = { id: 'F011', title: 'رایگان', version: 1, kind: 'document', size_total: 100, parts_count: 1, price: 0 };
  const view = fileView(file, [{ file_name: 'free.txt' }], [{ version: 1 }], 0);
  assert.match(view.text, /قیمت: رایگان/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'fl:dl:F011:1' && b.text === '⬇️ دریافت'));
});

test('file view in DB-group mode has no wallet/home buttons and back closes the screen', () => {
  const file = { id: 'F012', title: 'X', version: 1, kind: 'document', size_total: 100, parts_count: 1, price: 50000 };
  const view = fileView(file, [{ file_name: 'x.txt' }], [{ version: 1 }], 0, 0, { db: true });
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(!buttons.some((b) => b.callback_data === 'w:home'));
  assert.ok(!buttons.some((b) => b.callback_data === 'm:home'));
  assert.ok(buttons.some((b) => b.callback_data === 'db:cls'));
});

test('wallet view shows the balance and the charge button', () => {
  const view = walletView(75000, []);
  assert.match(view.text, /💰 کیف پول: ۷۵٬۰۰۰ تومان/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'w:charge'));
  assert.ok(buttons.some((b) => b.callback_data === 'w:tx:0'));
});

test('charge view shows the card number and preset amounts', () => {
  const view = chargeView('6037991122334455');
  assert.match(view.text, /6037991122334455/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'w:amt:50000'));
  assert.ok(buttons.some((b) => b.callback_data === 'w:amtc'));
  const empty = chargeView('');
  assert.match(empty.text, /شماره کارت هنوز تنظیم نشده/);
});

test('stats view shows wallet totals and pending receipts', () => {
  const view = statsView({
    filesTotal: 4,
    partsTotal: 6,
    sizeTotal: 2048,
    downloadsTotal: 9,
    usersTotal: 12,
    usersToday: 2,
    usersWeek: 5,
    totalCharged: 200000,
    totalPurchased: 50000,
    pendingReceipts: 2,
  });
  assert.match(view.text, /شارژها: ۲۰۰٬۰۰۰ تومان/);
  assert.match(view.text, /خریدها: ۵۰٬۰۰۰ تومان/);
  assert.match(view.text, /رسیدهای در انتظار: 2 مورد/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'st:usearch'));
  assert.ok(buttons.some((b) => b.callback_data === 'st:tx:0'));
  assert.ok(buttons.some((b) => b.callback_data === 'st:notify'));
});

test('user search results list matches with paging and a back button', () => {
  const users = [
    { user_id: 123, username: 'ali', first_name: 'Ali', last_name: null },
    { user_id: 456, username: null, first_name: 'Sara', last_name: null },
  ];
  const view = userSearchResultsView(users, 0, 'a');
  assert.match(view.text, /جستجوی کاربر: «a» — 2 نتیجه/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'st:u:123'));
  assert.ok(buttons.some((b) => b.callback_data === 'st:u:456'));
  assert.ok(buttons.some((b) => b.text === '◀ بازگشت'));
});

test('main menu shows the notify button only to the owner, and support to everyone', () => {
  const ownerKb = persistentKeyboard(true).keyboard.flat();
  const userKb = persistentKeyboard(false).keyboard.flat();
  assert.ok(ownerKb.some((b) => b.text === MENU_LABELS.notify));
  assert.ok(!userKb.some((b) => b.text === MENU_LABELS.notify));
  assert.ok(ownerKb.some((b) => b.text === MENU_LABELS.support));
  assert.ok(userKb.some((b) => b.text === MENU_LABELS.support));
});

test('main menu shows the dashboard web-app button only to the owner', () => {
  const ownerKb = persistentKeyboard(true).keyboard.flat();
  const userKb = persistentKeyboard(false).keyboard.flat();
  const dash = ownerKb.find((b) => b.text === '🖥️ داشبورد مدیریت');
  assert.ok(dash);
  assert.equal(dash.web_app.url, 'https://app8692409054.tgcloud.ai/');
  assert.ok(!userKb.some((b) => b.text === '🖥️ داشبورد مدیریت'));
});

test('notify audience view offers all, one file, and one user', () => {
  const view = notifyAudienceView();
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'nf:all'));
  assert.ok(buttons.some((b) => b.callback_data === 'nf:file'));
  assert.ok(buttons.some((b) => b.callback_data === 'nf:user'));
  assert.ok(buttons.some((b) => b.callback_data === 'm:home'));
  const noted = notifyAudienceView('پیام ارسال شد ✅');
  assert.match(noted.text, /پیام ارسال شد/);
});

test('notify file picker lists files with pick buttons and pages', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({
    id: 'F' + String(i + 1).padStart(3, '0'),
    title: 'فایل ' + (i + 1),
    version: 1,
    parts_count: 1,
  }));
  const view = notifyFilePickerView(items, 1);
  assert.match(view.text, /کاربران کدام فایل؟ \(صفحه 2 از 2\)/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'nf:fpick:F006'));
  assert.ok(buttons.some((b) => b.callback_data === 'nf:fpk:0'));
  assert.ok(buttons.some((b) => b.callback_data === 'm:notify'));
  const empty = notifyFilePickerView([], 0);
  assert.match(empty.text, /هنوز فایلی نیست/);
});

test('support prompt asks for one message and cancels back to the menu', () => {
  const view = supportPromptView();
  assert.match(view.text, /پیامت به پشتیبانی را بفرست/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'sp:cx'));
  assert.ok(buttons.some((b) => b.callback_data === 'm:home'));
});

test('balance prompt shows the current balance and cancels to the user detail', () => {
  const view = balancePromptView({ user_id: 123, username: 'ali', balance: 50000 });
  assert.match(view.text, /موجودی @ali: ۵۰٬۰۰۰ تومان/);
  assert.match(view.text, /موجودی جدید را به تومان بفرستید/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'st:u:123'));
});

test('user detail has a balance-fix button', () => {
  const view = statsUserView(
    { user_id: 123, username: 'ali', first_name: 'Ali', phone: null, is_member: 1, first_seen: 1, last_seen: 2 },
    [],
  );
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'st:bal:123'));
  assert.ok(buttons.some((b) => b.callback_data === 'st:msg:123'));
});

test('database view lists table counts and the backup button', () => {
  const view = dbView({
    files: 3,
    file_parts: 4,
    file_versions: 3,
    downloads: 9,
    users: 12,
    wallet_transactions: 5,
    github_cache: 1,
    expiring_messages: 2,
  });
  assert.match(view.text, /فایل‌ها: 3 مورد/);
  assert.match(view.text, /دانلودها: 9 مورد/);
  assert.match(view.text, /کاربران: 12 نفر/);
  assert.match(view.text, /تراکنش‌ها: 5 مورد/);
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'st:backup'));
  assert.ok(buttons.some((b) => b.callback_data === 'st:cleardl'));
  assert.ok(buttons.some((b) => b.callback_data === 'st:clearcache'));
  assert.ok(buttons.some((b) => b.callback_data === 'm:stats'));
});

test('transaction line shows a manual adjustment as تغییر دستی', () => {
  const view = walletView(0, [
    { kind: 'adjust', amount: 20000, status: 'approved', created_at: Date.UTC(2026, 10, 7, 12, 0, 0) },
    { kind: 'adjust', amount: -5000, status: 'approved', created_at: Date.UTC(2026, 10, 7, 12, 0, 0) },
  ]);
  assert.match(view.text, /➕ ۲۰٬۰۰۰ تومان — تغییر دستی/);
  assert.match(view.text, /➖ ۵٬۰۰۰ تومان — تغییر دستی/);
});

test('stats view links to database management', () => {
  const view = statsView({
    filesTotal: 1,
    partsTotal: 1,
    sizeTotal: 10,
    downloadsTotal: 0,
    usersTotal: 1,
    usersToday: 0,
    usersWeek: 0,
  });
  const buttons = view.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === 'st:db'));
});
