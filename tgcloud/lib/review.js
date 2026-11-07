// The review queue: pure helpers with no 'sdk' import, so they can be
// tested under plain Node. The inbox is a transient queue grouped by AI
// topic category AND by RSS feed — the owner picks a group, then reviews
// its items one by one (confirm / previous / next). Unconfirmed items
// simply stay 'new' for 3 days and are then pruned.
//
// Group keys are short so they fit Telegram's 64-byte callback limit:
// 'all', 'c<category index>', 'f<feed id>'.

import { CATEGORIES, categoryOf } from './categories.js';

// Groups with their counts, in display order: categories (in CATEGORIES
// order), then feeds (in rss_feeds order). Only groups with items appear.
export function reviewGroups(items, feeds) {
  const list = Array.isArray(items) ? items : [];
  const categories = CATEGORIES.map((name, index) => ({
    key: 'c' + index,
    name,
    count: list.filter((it) => categoryOf(it) === name).length,
  })).filter((g) => g.count > 0);
  const feedGroups = (Array.isArray(feeds) ? feeds : []).map((f) => ({
    key: 'f' + f.id,
    name: f.name || f.url,
    count: list.filter((it) => it.feed_id === f.id).length,
  })).filter((g) => g.count > 0);
  return { categories, feeds: feedGroups, total: list.length };
}

// Parse a group key. Returns { type: 'all'|'cat'|'feed', index?, feedId? }
// or null for an unknown key.
export function parseGroupKey(key) {
  if (key === 'all') return { type: 'all' };
  let m = /^c(\d+)$/.exec(String(key ?? ''));
  if (m && Number(m[1]) < CATEGORIES.length) {
    return { type: 'cat', index: Number(m[1]) };
  }
  m = /^f(\d+)$/.exec(String(key ?? ''));
  if (m) return { type: 'feed', feedId: Number(m[1]) };
  return null;
}

// Display name of a group ('همه خبرها' / category name / feed name).
export function groupLabel(key, feeds) {
  const parsed = parseGroupKey(key);
  if (!parsed) return 'صندوق خبر';
  if (parsed.type === 'all') return 'همه خبرها';
  if (parsed.type === 'cat') return CATEGORIES[parsed.index];
  const feed = (Array.isArray(feeds) ? feeds : []).find((f) => f.id === parsed.feedId);
  return feed ? feed.name || feed.url : 'فید';
}

// The items of one group, newest first (id desc).
export function itemsForGroup(items, key) {
  const parsed = parseGroupKey(key);
  const list = Array.isArray(items) ? items : [];
  if (!parsed) return [];
  if (parsed.type === 'all') return [...list].sort((a, b) => b.id - a.id);
  if (parsed.type === 'cat') {
    return list
      .filter((it) => categoryOf(it) === CATEGORIES[parsed.index])
      .sort((a, b) => b.id - a.id);
  }
  return list
    .filter((it) => it.feed_id === parsed.feedId)
    .sort((a, b) => b.id - a.id);
}

// Index of the item at `index + dir` in a group list, or -1 when there is
// no such item (already at the first/last item — no wrap-around).
export function neighborIndex(items, currentId, dir) {
  const list = Array.isArray(items) ? items : [];
  const at = list.findIndex((it) => it.id === Number(currentId));
  if (at === -1) return -1;
  const next = at + dir;
  return next >= 0 && next < list.length ? next : -1;
}
