import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paginate,
  formatBytes,
  formatToman,
  parseAmount,
  isPremiumFile,
  canAfford,
  searchUsers,
  nextFileId,
  normalizeDigits,
  parseFileId,
  parseTitleDescription,
  groupCategories,
  categoryOptions,
  needsPhonePrompt,
  extractFileMeta,
  searchFiles,
  isMemberStatus,
  buildUserRow,
  aggregateDownloads,
  countNewUsers,
  parseGitHubRepos,
  FILE_TTL_SEC,
  NOTICE_TTL_SEC,
  expiredRows,
  fileDownloaders,
} from '../tgcloud/lib/pure.js';

test('formatToman renders Persian thousands with the تومان suffix', () => {
  assert.equal(formatToman(12000), '۱۲٬۰۰۰ تومان');
  assert.equal(formatToman(50000), '۵۰٬۰۰۰ تومان');
  assert.equal(formatToman(0), '۰ تومان');
  assert.equal(formatToman(null), '۰ تومان');
});

test('parseAmount tolerates Persian digits, commas and the تومان suffix', () => {
  assert.equal(parseAmount('۵۰٬۰۰۰ تومان'), 50000);
  assert.equal(parseAmount('50,000'), 50000);
  assert.equal(parseAmount('100000'), 100000);
  assert.equal(parseAmount('  ۲۵ ۰۰۰  '), 25000);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('0', true), 0);
  assert.equal(parseAmount('0 تومان', true), 0);
  assert.equal(parseAmount('1500000000'), null);
});

test('isPremiumFile is true only above a zero price; canAfford covers equality', () => {
  assert.equal(isPremiumFile({ price: 50000 }), true);
  assert.equal(isPremiumFile({ price: 0 }), false);
  assert.equal(isPremiumFile({}), false);
  assert.equal(isPremiumFile(null), false);
  assert.equal(canAfford(10000, 5000), true);
  assert.equal(canAfford(5000, 5000), true);
  assert.equal(canAfford(4000, 5000), false);
  assert.equal(canAfford(null, 0), true);
});

test('searchUsers matches username, name and id, case-insensitive', () => {
  const users = [
    { user_id: 123, username: 'ali_reza', first_name: 'Ali', last_name: 'رضایی' },
    { user_id: 456, username: null, first_name: 'Sara', last_name: null },
    { user_id: 789, username: 'ERFAN', first_name: 'Erfan', last_name: null },
  ];
  assert.deepEqual(searchUsers(users, 'ali').map((u) => u.user_id), [123]);
  assert.deepEqual(searchUsers(users, 'رضا').map((u) => u.user_id), [123]);
  assert.deepEqual(searchUsers(users, 'sara').map((u) => u.user_id), [456]);
  assert.deepEqual(searchUsers(users, 'erfan').map((u) => u.user_id), [789]);
  assert.deepEqual(searchUsers(users, '456').map((u) => u.user_id), [456]);
  assert.deepEqual(searchUsers(users, ''), []);
  assert.deepEqual(searchUsers(users, 'nobody'), []);
});

test('buildUserRow keeps the wallet balance across interactions', () => {
  const base = buildUserRow({ id: 5, first_name: 'X' }, null, 100, true);
  assert.equal(base.balance, 0);
  base.balance = 5000;
  const next = buildUserRow({ id: 5, first_name: 'X' }, base, 200, true);
  assert.equal(next.balance, 5000);
});

test('paginate slices 5 per page and clamps out-of-range pages', () => {
  const items = Array.from({ length: 12 }, (_, i) => i + 1);
  assert.deepEqual(paginate(items, 0, 5).pageItems, [1, 2, 3, 4, 5]);
  assert.deepEqual(paginate(items, 2, 5).pageItems, [11, 12]);
  assert.deepEqual(paginate(items, 9, 5).pageItems, [11, 12]);
  assert.deepEqual(paginate([], 0, 5), { pageItems: [], page: 0, totalPages: 1, total: 0 });
});

test('formatBytes renders Persian units', () => {
  assert.equal(formatBytes(500), '500 بایت');
  assert.equal(formatBytes(2048), '2.0 کیلوبایت');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 مگابایت');
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2.00 گیگابایت');
  assert.equal(formatBytes(null), '—');
});

test('nextFileId is sequential and zero-padded', () => {
  assert.equal(nextFileId(0), 'F001');
  assert.equal(nextFileId(7), 'F008');
  assert.equal(nextFileId(24), 'F025');
  assert.equal(nextFileId(999), 'F1000');
});

test('normalizeDigits converts Persian and Arabic digits', () => {
  assert.equal(normalizeDigits('۲۵'), '25');
  assert.equal(normalizeDigits('۱۲۳'), '123');
  assert.equal(normalizeDigits('٢٥'), '25');
  assert.equal(normalizeDigits('F۰۲۵'), 'F025');
  assert.equal(normalizeDigits('abc'), 'abc');
});

test('parseFileId resolves F001 and F25/F025 (Persian digits work) and nothing else', () => {
  assert.equal(parseFileId('F001'), 'F001');
  assert.equal(parseFileId('f25'), 'F025');
  assert.equal(parseFileId('F025'), 'F025');
  assert.equal(parseFileId('F۲۵'), 'F025');
  assert.equal(parseFileId('/get F003'), 'F003');
  // A bare number is NOT a file id — files are requested by their
  // auto id (F001) or by name search.
  assert.equal(parseFileId('25'), null);
  assert.equal(parseFileId('۲۵'), null);
  assert.equal(parseFileId('/get 25'), null);
});

test('parseFileId returns null for non-id text', () => {
  assert.equal(parseFileId('hello'), null);
  assert.equal(parseFileId(''), null);
  assert.equal(parseFileId('F'), null);
  assert.equal(parseFileId('پرامپت هوش مصنوعی'), null);
});

test('parseTitleDescription splits title and description; a # line is plain text, never a number', () => {
  assert.deepEqual(parseTitleDescription('عنوان فایل\nتوضیح کامل'), {
    title: 'عنوان فایل',
    description: 'توضیح کامل',
  });
  assert.deepEqual(parseTitleDescription('فقط عنوان'), {
    title: 'فقط عنوان',
    description: null,
  });
  // The bot never asks for a number: "#۲۵" is kept as the title text.
  assert.deepEqual(parseTitleDescription('#۲۵\nعنوان فایل'), {
    title: '#۲۵',
    description: 'عنوان فایل',
  });
  assert.deepEqual(parseTitleDescription(''), { title: '', description: null });
});

test('groupCategories counts per category, most files first, missing means سایر', () => {
  assert.deepEqual(
    groupCategories([
      { category: 'پرامپت' },
      { category: 'پرامپت' },
      { category: 'عکس' },
      { category: null },
      {},
    ]),
    [
      { name: 'پرامپت', count: 2 },
      { name: 'سایر', count: 2 },
      { name: 'عکس', count: 1 },
    ],
  );
  assert.deepEqual(groupCategories([]), []);
});

test('categoryOptions lists existing categories and appends سایر when missing', () => {
  assert.deepEqual(
    categoryOptions([{ category: 'پرامپت' }, { category: 'عکس' }]),
    ['پرامپت', 'عکس', 'سایر'],
  );
  assert.deepEqual(
    categoryOptions([{ category: 'سایر' }, { category: 'پرامپت' }]),
    ['پرامپت', 'سایر'],
  );
  assert.deepEqual(categoryOptions([]), ['سایر']);
});

test('needsPhonePrompt is true only while the user never shared a phone', () => {
  assert.equal(needsPhonePrompt(null), true);
  assert.equal(needsPhonePrompt({ user_id: 1, phone: null }), true);
  assert.equal(needsPhonePrompt({ user_id: 1 }), true);
  assert.equal(needsPhonePrompt({ user_id: 1, phone: '+989121234567' }), false);
});

test('extractFileMeta keeps the original file_name verbatim', () => {
  const meta = extractFileMeta({
    message_id: 10,
    date: 1794000000,
    document: {
      file_id: 'BQACAgQ',
      file_unique_id: 'AgAD',
      file_name: 'پرامپت ویژه (نسخه ۱).txt',
      mime_type: 'text/plain',
      file_size: 1234,
    },
  });
  assert.equal(meta.kind, 'document');
  assert.equal(meta.file_name, 'پرامپت ویژه (نسخه ۱).txt');
  assert.equal(meta.tg_file_id, 'BQACAgQ');
  assert.equal(meta.size, 1234);
});

test('extractFileMeta takes the largest photo size and keeps dimensions', () => {
  const meta = extractFileMeta({
    message_id: 11,
    date: 1794000000,
    photo: [
      { file_id: 'small', file_unique_id: 's', file_size: 1000, width: 90, height: 90 },
      { file_id: 'big', file_unique_id: 'b', file_size: 90000, width: 1280, height: 720 },
    ],
  });
  assert.equal(meta.kind, 'photo');
  assert.equal(meta.tg_file_id, 'big');
  assert.equal(meta.width, 1280);
  assert.equal(meta.height, 720);
  assert.equal(meta.size, 90000);
});

test('extractFileMeta covers video, audio and voice with duration', () => {
  const video = extractFileMeta({
    message_id: 12,
    date: 1794000000,
    video: { file_id: 'v', file_unique_id: 'vu', file_name: 'clip.mp4', mime_type: 'video/mp4', file_size: 5000, width: 640, height: 360, duration: 83 },
  });
  assert.equal(video.kind, 'video');
  assert.equal(video.duration, 83);
  assert.equal(video.file_name, 'clip.mp4');
  const audio = extractFileMeta({
    message_id: 13,
    date: 1794000000,
    audio: { file_id: 'a', file_unique_id: 'au', duration: 200, file_size: 3000 },
  });
  assert.equal(audio.kind, 'audio');
  assert.equal(audio.duration, 200);
  const voice = extractFileMeta({
    message_id: 14,
    date: 1794000000,
    voice: { file_id: 'vc', file_unique_id: 'vu', duration: 12, file_size: 8000 },
  });
  assert.equal(voice.kind, 'voice');
  assert.equal(voice.duration, 12);
});

test('extractFileMeta returns null when the message has no file', () => {
  assert.equal(extractFileMeta({ message_id: 1, text: 'سلام' }), null);
  assert.equal(extractFileMeta(null), null);
});

test('searchFiles matches title, description, category and file names, case-insensitive', () => {
  const files = [
    { title: 'پرامپت میدجرنی', description: 'عکس حرفه‌ای', category: 'پرامپت', fileNames: ['prompt.txt'] },
    { title: 'چک‌لیست داکر', description: '', category: 'ابزار', fileNames: ['docker-cheatsheet.md'] },
    { title: 'عکس پروفایل', description: 'آواتار', category: 'عکس', fileNames: ['avatar.jpg'] },
  ];
  assert.deepEqual(searchFiles(files, 'پرامپت').map((f) => f.title), ['پرامپت میدجرنی']);
  assert.deepEqual(searchFiles(files, 'DOCKER').map((f) => f.title), ['چک‌لیست داکر']);
  assert.deepEqual(searchFiles(files, 'avatar').map((f) => f.title), ['عکس پروفایل']);
  assert.deepEqual(searchFiles(files, 'ابزار').map((f) => f.title), ['چک‌لیست داکر']);
  assert.deepEqual(searchFiles(files, 'عکس').map((f) => f.title), ['پرامپت میدجرنی', 'عکس پروفایل']);
  assert.deepEqual(searchFiles(files, 'توضیح'), []);
  assert.deepEqual(searchFiles(files, ''), []);
  assert.deepEqual(searchFiles(files, '   '), []);
});

test('isMemberStatus maps getChatMember statuses (fail closed)', () => {
  for (const s of ['creator', 'administrator', 'member', 'restricted']) {
    assert.equal(isMemberStatus(s), true, s);
  }
  for (const s of ['left', 'kicked', 'unknown', null, undefined]) {
    assert.equal(isMemberStatus(s), false, String(s));
  }
});

test('buildUserRow upserts from the Telegram update: first_seen set once, last_seen moves', () => {
  const from = {
    id: 123,
    username: 'someone',
    first_name: 'Ali',
    last_name: 'Rezaei',
    language_code: 'fa',
    is_premium: true,
  };
  const first = buildUserRow(from, null, 1000, null);
  assert.equal(first.user_id, 123);
  assert.equal(first.username, 'someone');
  assert.equal(first.first_name, 'Ali');
  assert.equal(first.last_name, 'Rezaei');
  assert.equal(first.language_code, 'fa');
  assert.equal(first.is_premium, 1);
  assert.equal(first.first_seen, 1000);
  assert.equal(first.last_seen, 1000);
  assert.equal(first.is_member, null);

  const second = buildUserRow({ ...from, username: 'renamed' }, first, 5000, true);
  assert.equal(second.first_seen, 1000);
  assert.equal(second.last_seen, 5000);
  assert.equal(second.username, 'renamed');
  assert.equal(second.is_member, 1);

  // A later interaction without a fresh membership value keeps the old one.
  const third = buildUserRow(from, second, 9000, null);
  assert.equal(third.is_member, 1);
  assert.equal(third.first_seen, 1000);
});

test('buildUserRow never invents a phone number or contact data', () => {
  const row = buildUserRow({ id: 5, first_name: 'X' }, null, 100, false);
  assert.ok(!('phone_number' in row));
  assert.ok(!('contact' in row));
  assert.ok(!('location' in row));
  assert.equal(row.phone, null);
  assert.equal(row.is_member, 0);
});

test('buildUserRow keeps a phone shared earlier across later interactions', () => {
  const base = buildUserRow({ id: 5, first_name: 'X' }, null, 100, true);
  base.phone = '+989121234567';
  const next = buildUserRow({ id: 5, first_name: 'X' }, base, 200, true);
  assert.equal(next.phone, '+989121234567');
  assert.equal(next.first_seen, 100);
});

test('aggregateDownloads counts per file and tracks the last download', () => {
  const agg = aggregateDownloads([
    { file_id: 'F001', downloaded_at: 100 },
    { file_id: 'F001', downloaded_at: 300 },
    { file_id: 'F002', downloaded_at: 200 },
  ]);
  assert.deepEqual(agg, {
    F001: { count: 2, lastAt: 300 },
    F002: { count: 1, lastAt: 200 },
  });
  assert.deepEqual(aggregateDownloads([]), {});
});

test('countNewUsers counts first_seen inside the window', () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0);
  const rows = [
    { first_seen: now - 60 * 60 * 1000 },
    { first_seen: now - 2 * 24 * 60 * 60 * 1000 },
    { first_seen: now - 10 * 24 * 60 * 60 * 1000 },
  ];
  assert.equal(countNewUsers(rows, now, 24 * 60 * 60 * 1000), 1);
  assert.equal(countNewUsers(rows, now, 7 * 24 * 60 * 60 * 1000), 2);
});

test('parseGitHubRepos drops forks, sorts newest first, keeps display fields', () => {
  const repos = parseGitHubRepos([
    { name: 'old', fork: false, description: 'a', language: 'Python', stargazers_count: 3, html_url: 'https://github.com/u/old', updated_at: '2026-01-01T00:00:00Z' },
    { name: 'new', fork: false, description: null, language: 'JavaScript', stargazers_count: 10, html_url: 'https://github.com/u/new', updated_at: '2026-11-01T00:00:00Z' },
    { name: 'forked', fork: true, description: 'x', language: null, stargazers_count: 99, html_url: 'https://github.com/u/forked', updated_at: '2026-11-06T00:00:00Z' },
  ]);
  assert.deepEqual(repos.map((r) => r.name), ['new', 'old']);
  assert.equal(repos[0].stars, 10);
  assert.equal(repos[0].url, 'https://github.com/u/new');
  assert.equal(repos[0].description, null);
  assert.deepEqual(parseGitHubRepos(null), []);
});

test('expiry windows: files 60s, notices 20s', () => {
  assert.equal(FILE_TTL_SEC, 60);
  assert.equal(NOTICE_TTL_SEC, 20);
});

test('expiredRows keeps only rows whose delete_at has passed', () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0);
  const rows = [
    { id: 1, delete_at: now - 1000 },
    { id: 2, delete_at: now },
    { id: 3, delete_at: now + 1000 },
    { id: 4, delete_at: null },
  ];
  assert.deepEqual(expiredRows(rows, now).map((r) => r.id), [1, 2, 4]);
  assert.deepEqual(expiredRows([], now), []);
  assert.deepEqual(expiredRows(null, now), []);
});

test('fileDownloaders returns unique downloaders of one file, newest first', () => {
  const rows = [
    { file_id: 'F001', user_id: 111, downloaded_at: 100 },
    { file_id: 'F001', user_id: 222, downloaded_at: 300 },
    { file_id: 'F001', user_id: 111, downloaded_at: 500 },
    { file_id: 'F002', user_id: 333, downloaded_at: 400 },
    { file_id: 'F001', user_id: null, downloaded_at: 600 },
  ];
  assert.deepEqual(fileDownloaders(rows, 'F001'), [111, 222]);
  assert.deepEqual(fileDownloaders(rows, 'F002'), [333]);
  assert.deepEqual(fileDownloaders(rows, 'F999'), []);
  assert.deepEqual(fileDownloaders(null, 'F001'), []);
});
