// The inbox: the single implementation of RSS fetching, pruning and
// listing. Both handlers use this — there is exactly one fetchNews, one
// inbox lister and one draft renderer, so the bot can never show a
// different truth in two places.

import { db } from 'sdk';
import { eq } from 'sdk/db';
import { rss_feeds, news_items, drafts } from '../schema.js';
import { callWorker } from './worker.js';
import { workerErrorMessage } from './errors.js';
import { normalizeUrl, pruneBefore, prunePublishedBefore } from './pure.js';
import { parsePublishedAt } from './format.js';
import { seedFeedsIfEmpty } from './store.js';
import { reviewGroups } from './review.js';
import { inboxMenuView } from './views.js';

const CLASSIFY_CHUNK = 30;

// Hard-delete 'new' items older than 3 days (v7: the owner may change
// his mind within 3 days, then the item is gone). Returns how many were
// removed.
export async function pruneOldNews() {
  const cutoff = pruneBefore(Date.now());
  const rows = await db.select().from(news_items).all();
  let removed = 0;
  for (const row of rows) {
    if (row.status !== 'new') continue;
    const when = row.fetched_at ?? row.published_at ?? 0;
    if (when && when < cutoff) {
      await db.delete(news_items).where(eq(news_items.id, row.id)).run();
      removed += 1;
    }
  }
  return removed;
}

// Hard-delete published drafts older than 30 days. Returns how many were
// removed. Drafts still being worked on are never touched.
export async function prunePublishedDrafts() {
  const cutoff = prunePublishedBefore(Date.now());
  const rows = await db.select().from(drafts).all();
  let removed = 0;
  for (const row of rows) {
    if (row.status !== 'published') continue;
    const when = parsePublishedAt(row.created_at);
    if (when && when < cutoff) {
      await db.delete(drafts).where(eq(drafts.id, row.id)).run();
      removed += 1;
    }
  }
  return removed;
}

// Ask the Worker to classify freshly inserted items (one AI call per
// batch of 30). Any failure leaves the category empty — the item reads as
// 'سایر' and the fetch itself never fails because of classification.
export async function classifyItems(rows) {
  for (let i = 0; i < rows.length; i += CLASSIFY_CHUNK) {
    const chunk = rows.slice(i, i + CLASSIFY_CHUNK);
    const res = await callWorker('/ai/classify', {
      items: chunk.map((r) => ({ id: r.id, title: r.title || '', text: r.description || '' })),
    });
    if (!res || res.ok !== true || !Array.isArray(res.categories)) continue;
    const byId = new Map(res.categories.map((c) => [Number(c.id), c.category]));
    for (const row of chunk) {
      const category = byId.get(row.id);
      if (!category) continue;
      await db
        .update(news_items)
        .set({ category })
        .where(eq(news_items.id, row.id))
        .run();
    }
  }
}

// Fetch fresh news from the active feeds and insert the new items.
// Returns { inserted, error } — error is a Persian message or null.
export async function fetchNews() {
  const feeds = await seedFeedsIfEmpty();
  const active = feeds.filter((f) => f.active !== 0);
  if (active.length === 0) {
    return { inserted: 0, error: 'هیچ فید فعالی نیست. با /addrss یک فید اضافه کنید.' };
  }
  const res = await callWorker('/news/fetch', {
    feeds: active.map((f) => f.url),
  });
  if (!res || res.ok !== true || !Array.isArray(res.items)) {
    return { inserted: 0, error: workerErrorMessage(res) || 'گرفتن خبرها ممکن نشد.' };
  }
  const now = Date.now();
  let inserted = 0;
  const insertedRows = [];
  for (const item of res.items) {
    if (!item || !item.link) continue;
    const guid = item.guid || normalizeUrl(item.link);
    const link = normalizeUrl(item.link);
    const byGuid = await db
      .select()
      .from(news_items)
      .where(eq(news_items.guid, guid))
      .get();
    if (byGuid) continue;
    const byLink = await db
      .select()
      .from(news_items)
      .where(eq(news_items.link, link))
      .get();
    if (byLink) continue;
    const feed = active.find((f) => f.url === item.feed_url) || null;
    const rows = await db
      .insert(news_items)
      .values({
        feed_id: feed ? feed.id : null,
        guid,
        title: item.title || link,
        link,
        description: item.description || null,
        published_at: parsePublishedAt(item.published_at),
        fetched_at: now,
        category: null,
        status: 'new',
      })
      .returning()
      .run();
    if (rows && rows[0]) {
      inserted += 1;
      insertedRows.push(rows[0]);
    }
  }
  for (const feed of active) {
    await db
      .update(rss_feeds)
      .set({ last_fetched_at: now, last_error: null })
      .where(eq(rss_feeds.id, feed.id))
      .run();
  }
  if (insertedRows.length > 0) await classifyItems(insertedRows);
  await pruneOldNews();
  await prunePublishedDrafts();
  return { inserted, error: null };
}

// All 'new' inbox items, newest first (after pruning stale ones).
export async function listNewItems() {
  await pruneOldNews();
  const rows = await db.select().from(news_items).all();
  return rows.filter((r) => r.status === 'new').sort((a, b) => b.id - a.id);
}

// The inbox menu screen (groups by category and by feed), shared by the
// /news command and the inbox menu button — one inbox lister.
export async function inboxMenu() {
  const items = await listNewItems();
  const feeds = await listFeeds();
  return inboxMenuView(reviewGroups(items, feeds), items.length);
}

// All drafts (any status except discarded), newest first.
export async function listDrafts() {
  const rows = await db.select().from(drafts).all();
  return rows
    .filter((d) => d.status !== 'discarded')
    .sort((a, b) => b.id - a.id);
}

// YouTube drafts only (any status except discarded), newest first.
// YouTube has its own section in the menu, separate from the news inbox.
export async function listYouTubeDrafts() {
  const rows = await db.select().from(drafts).all();
  return rows
    .filter((d) => d.kind === 'youtube' && d.status !== 'discarded')
    .sort((a, b) => b.id - a.id);
}

// Scheduled drafts only, soonest first.
export async function listScheduled() {
  const rows = await db.select().from(drafts).all();
  return rows
    .filter((d) => d.status === 'scheduled')
    .sort((a, b) => (a.publish_at || 0) - (b.publish_at || 0));
}

export async function getNewsItem(id) {
  return db.select().from(news_items).where(eq(news_items.id, Number(id))).get();
}

export async function getDraft(id) {
  return db.select().from(drafts).where(eq(drafts.id, Number(id))).get();
}

export async function getFeed(id) {
  return db.select().from(rss_feeds).where(eq(rss_feeds.id, Number(id))).get();
}

export async function listFeeds() {
  const rows = await db.select().from(rss_feeds).all();
  return rows.sort((a, b) => a.id - b.id);
}

// Small counts for the main menu and /diag.
export async function getCounts() {
  const news = await db.select().from(news_items).all();
  const allDrafts = await db.select().from(drafts).all();
  const feeds = await db.select().from(rss_feeds).all();
  return {
    feedsTotal: feeds.length,
    feedsActive: feeds.filter((f) => f.active !== 0).length,
    newsNew: news.filter((n) => n.status === 'new').length,
    drafts: allDrafts.filter((d) => d.status === 'draft').length,
    scheduled: allDrafts.filter((d) => d.status === 'scheduled').length,
    published: allDrafts.filter((d) => d.status === 'published').length,
    youtube: allDrafts.filter((d) => d.kind === 'youtube' && d.status !== 'discarded').length,
  };
}
