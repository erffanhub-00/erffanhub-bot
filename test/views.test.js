import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOwner } from '../tgcloud/lib/auth.js';
import { mainMenu, joinKeyboard } from '../tgcloud/lib/keyboards.js';
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
} from '../tgcloud/lib/views.js';

test('owner gate: isOwner refuses everyone while the owner id is unset (0)', () => {
  assert.equal(isOwner(123), false);
  assert.equal(isOwner(0), false);
  assert.equal(isOwner(null), false);
  assert.equal(isOwner(undefined), false);
});

test('main menu shows the stats button only to the owner', () => {
  const ownerKb = mainMenu(true).inline_keyboard.flat();
  const userKb = mainMenu(false).inline_keyboard.flat();
  assert.ok(ownerKb.some((b) => b.callback_data === 'm:stats'));
  assert.ok(!userKb.some((b) => b.callback_data === 'm:stats'));
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
