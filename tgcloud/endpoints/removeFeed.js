import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { rss_feeds, news_items } from '../schema.js';
import { isOwner } from '../lib/auth.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Delete a feed and all news items fetched from it. input: { id }.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const id = Number(input && (input.id ?? input.draft_id ?? input.feed_id));
    if (!Number.isInteger(id)) throw new Error('invalid_id');
    await db.delete(news_items).where(eq(news_items.feed_id, id)).run();
    await db.delete(rss_feeds).where(eq(rss_feeds.id, id)).run();
    return { ok: true };
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    if (err && err.message === 'invalid_id') throw err;
    throw new Error('remove_feed_failed');
  }
}
