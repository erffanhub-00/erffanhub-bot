import { db, EndpointError } from 'sdk';
import { rss_feeds, news_items, drafts, publish_log } from '../schema.js';
import { isOwner } from '../lib/auth.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Full data export for backup. input: {}. At most 500 rows per table,
// newest first. Never includes secrets: no secret is stored in these
// tables.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const feeds = await db.select().from(rss_feeds).all();
    const news = await db.select().from(news_items).all();
    const allDrafts = await db.select().from(drafts).all();
    const log = await db.select().from(publish_log).all();
    feeds.sort((a, b) => b.id - a.id);
    news.sort((a, b) => b.id - a.id);
    allDrafts.sort((a, b) => b.id - a.id);
    log.sort((a, b) => b.id - a.id);
    return {
      feeds: feeds.slice(0, 500),
      news_items: news.slice(0, 500),
      drafts: allDrafts.slice(0, 500),
      publish_log: log.slice(0, 500),
    };
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    throw new Error('export_failed');
  }
}
