import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, normalizeCategory, categoryOf } from '../tgcloud/lib/categories.js';
import {
  reviewGroups,
  itemsForGroup,
  parseGroupKey,
  groupLabel,
  neighborIndex,
} from '../tgcloud/lib/review.js';
import {
  mainMenu,
  reviewKeyboard,
  draftKeyboard,
  inboxMenuKeyboard,
} from '../tgcloud/lib/keyboards.js';
import {
  mainMenuView,
  inboxMenuView,
  reviewView,
  draftsView,
  youtubeView,
} from '../tgcloud/lib/views.js';

const feeds = [
  { id: 1, name: 'زومیت', url: 'https://www.zoomit.ir/feed/' },
  { id: 2, name: 'تک‌کرانچ', url: 'https://techcrunch.com/feed/' },
];

const items = [
  { id: 1, feed_id: 1, title: 'خبر یک', category: 'هوش مصنوعی', status: 'new' },
  { id: 2, feed_id: 2, title: 'خبر دو', category: 'موبایل', status: 'new' },
  { id: 3, feed_id: 1, title: 'خبر سه', category: 'هوش مصنوعی', status: 'new' },
  { id: 4, feed_id: 1, title: 'خبر قدیمی', category: null, status: 'new' },
];

test('categories list is fixed and normalizeCategory falls back to سایر', () => {
  assert.equal(CATEGORIES.length, 9);
  assert.ok(CATEGORIES.includes('هوش مصنوعی'));
  assert.equal(CATEGORIES[CATEGORIES.length - 1], 'سایر');
  assert.equal(normalizeCategory('هوش مصنوعی'), 'هوش مصنوعی');
  assert.equal(normalizeCategory('دسته نامعلوم'), 'سایر');
  assert.equal(normalizeCategory(''), 'سایر');
  assert.equal(normalizeCategory(null), 'سایر');
  assert.equal(categoryOf({ category: null }), 'سایر');
});

test('reviewGroups counts categories and feeds, skipping empty groups', () => {
  const groups = reviewGroups(items, feeds);
  assert.equal(groups.total, 4);
  assert.deepEqual(
    groups.categories.map((g) => [g.key, g.name, g.count]),
    [
      ['c0', 'موبایل', 1],
      ['c1', 'هوش مصنوعی', 2],
      ['c8', 'سایر', 1],
    ],
  );
  assert.deepEqual(
    groups.feeds.map((g) => [g.key, g.name, g.count]),
    [
      ['f1', 'زومیت', 3],
      ['f2', 'تک‌کرانچ', 1],
    ],
  );
  assert.deepEqual(reviewGroups([], feeds), { categories: [], feeds: [], total: 0 });
});

test('itemsForGroup filters by category, feed or all, newest first', () => {
  assert.deepEqual(itemsForGroup(items, 'c1').map((i) => i.id), [3, 1]);
  assert.deepEqual(itemsForGroup(items, 'c0').map((i) => i.id), [2]);
  assert.deepEqual(itemsForGroup(items, 'c8').map((i) => i.id), [4]);
  assert.deepEqual(itemsForGroup(items, 'f1').map((i) => i.id), [4, 3, 1]);
  assert.deepEqual(itemsForGroup(items, 'all').map((i) => i.id), [4, 3, 2, 1]);
  assert.deepEqual(itemsForGroup(items, 'bogus'), []);
});

test('parseGroupKey accepts all, c<index> and f<id>', () => {
  assert.deepEqual(parseGroupKey('all'), { type: 'all' });
  assert.deepEqual(parseGroupKey('c1'), { type: 'cat', index: 1 });
  assert.deepEqual(parseGroupKey('f2'), { type: 'feed', feedId: 2 });
  assert.equal(parseGroupKey('c99'), null);
  assert.equal(parseGroupKey('bogus'), null);
  assert.equal(parseGroupKey(null), null);
});

test('groupLabel names the group in Persian', () => {
  assert.equal(groupLabel('all', feeds), 'همه خبرها');
  assert.equal(groupLabel('c1', feeds), 'هوش مصنوعی');
  assert.equal(groupLabel('f1', feeds), 'زومیت');
  assert.equal(groupLabel('f9', feeds), 'فید');
});

test('neighborIndex moves within the group and stops at the ends', () => {
  const group = itemsForGroup(items, 'c1'); // [3, 1]
  assert.equal(neighborIndex(group, 3, 1), 1);
  assert.equal(neighborIndex(group, 3, -1), -1);
  assert.equal(neighborIndex(group, 1, -1), 0);
  assert.equal(neighborIndex(group, 1, 1), -1);
  assert.equal(neighborIndex(group, 999, 1), -1);
  assert.equal(neighborIndex(group, 999, -1), -1);
});

test('review keyboard has exactly 3 buttons: confirm, previous, next', () => {
  const kb = reviewKeyboard('c1', 3);
  assert.equal(kb.inline_keyboard.length, 1);
  const row = kb.inline_keyboard[0];
  assert.equal(row.length, 3);
  assert.equal(row[0].text, '✅ تایید');
  assert.equal(row[0].callback_data, 'rv:cf:c1:3');
  assert.equal(row[1].callback_data, 'rv:pv:c1:3');
  assert.equal(row[2].callback_data, 'rv:nx:c1:3');
  for (const b of row) assert.ok(b.callback_data.length <= 64);
});

test('inbox menu keyboard lists category groups, feed groups and all news', () => {
  const groups = reviewGroups(items, feeds);
  const kb = inboxMenuKeyboard(groups, 4);
  const data = kb.inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(data.includes('rv:g:c1'));
  assert.ok(data.includes('rv:g:c0'));
  assert.ok(data.includes('rv:g:f1'));
  assert.ok(data.includes('rv:g:f2'));
  assert.ok(data.includes('rv:g:all'));
  assert.ok(data.includes('rv:ft'));
});

test('review view shows header, category, feed, title and link', () => {
  const view = reviewView(items[0], 'c1', 'هوش مصنوعی', 1, 2, 'زومیت');
  assert.ok(view.text.includes('هوش مصنوعی — خبر 2 از 2'));
  assert.ok(view.text.includes('خبر یک'));
  assert.ok(view.text.includes('دسته: هوش مصنوعی'));
  assert.ok(view.text.includes('منبع: زومیت'));
  assert.equal(view.reply_markup.inline_keyboard[0].length, 3);
});

test('main menu has its own YouTube row with the draft count', () => {
  const kb = mainMenu({ youtube: 3 });
  const texts = kb.inline_keyboard.flat().map((b) => b.text);
  assert.ok(texts.includes('یوتیوب (3)'));
  const yt = kb.inline_keyboard.flat().find((b) => b.callback_data === 'm:yt');
  assert.ok(yt);
  const view = mainMenuView({
    newsNew: 4,
    drafts: 1,
    scheduled: 0,
    feedsActive: 2,
    feedsTotal: 2,
    youtube: 3,
  });
  assert.ok(view.text.includes('یوتیوب: 3'));
});

test('draft keyboard adds a watch button for YouTube drafts and a resume row', () => {
  const yt = { id: 7, kind: 'youtube', button_url: 'https://www.youtube.com/watch?v=x' };
  const kb = draftKeyboard(yt, { resume: true });
  const flat = kb.inline_keyboard.flat();
  const watch = flat.find((b) => b.text === 'تماشا در یوتیوب');
  assert.ok(watch);
  assert.equal(watch.url, 'https://www.youtube.com/watch?v=x');
  const resume = flat.find((b) => b.callback_data === 'rv:rs');
  assert.ok(resume);
  const newsKb = draftKeyboard({ id: 8, kind: 'news' });
  assert.equal(newsKb.inline_keyboard.flat().some((b) => b.text === 'تماشا در یوتیوب'), false);
  assert.equal(newsKb.inline_keyboard.flat().some((b) => b.callback_data === 'rv:rs'), false);
});

test('drafts list labels each row as news or YouTube', () => {
  const view = draftsView(
    [
      { id: 1, kind: 'news', title: 'خبر', status: 'draft' },
      { id: 2, kind: 'youtube', title: 'ویدیو', status: 'draft' },
    ],
    0,
  );
  assert.ok(view.text.includes('[خبر] خبر'));
  assert.ok(view.text.includes('[یوتیوب] ویدیو'));
});

test('YouTube view lists only video drafts', () => {
  const view = youtubeView(
    [{ id: 2, kind: 'youtube', title: 'ویدیو', status: 'draft' }],
    0,
  );
  assert.ok(view.text.includes('ویدیوهای یوتیوب'));
  assert.ok(view.text.includes('ویدیو'));
});

test('inbox menu view lists category and feed sections', () => {
  const groups = reviewGroups(items, feeds);
  const view = inboxMenuView(groups, 4);
  assert.ok(view.text.includes('دسته‌ها:'));
  assert.ok(view.text.includes('هوش مصنوعی (2)'));
  assert.ok(view.text.includes('فیدها:'));
  assert.ok(view.text.includes('زومیت (3)'));
  const empty = inboxMenuView({ categories: [], feeds: [], total: 0 }, 0);
  assert.ok(empty.text.includes('خالی است'));
});
