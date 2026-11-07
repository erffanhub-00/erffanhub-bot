import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { rss_feeds } from '../schema.js';
import { isOwner } from '../lib/auth.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Flip a feed between active and inactive. input: { id }.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const id = Number(input && (input.id ?? input.draft_id ?? input.feed_id));
    if (!Number.isInteger(id)) throw new Error('invalid_id');
    const feed = await db
      .select()
      .from(rss_feeds)
      .where(eq(rss_feeds.id, id))
      .get();
    if (!feed) throw new Error('feed_not_found');
    await db
      .update(rss_feeds)
      .set({ active: feed.active === 0 ? 1 : 0 })
      .where(eq(rss_feeds.id, id))
      .run();
    const updated = await db
      .select()
      .from(rss_feeds)
      .where(eq(rss_feeds.id, id))
      .get();
    return updated;
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    if (err && ['invalid_id', 'feed_not_found'].includes(err.message)) throw err;
    throw new Error('toggle_feed_failed');
  }
}
