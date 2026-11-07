import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { rss_feeds } from '../schema.js';
import { isOwner } from '../lib/auth.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Add an RSS feed. input: { url, name? }. The URL must be https.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const url = input && typeof input.url === 'string' ? input.url.trim() : '';
    const name =
      input && typeof input.name === 'string' && input.name.trim()
        ? input.name.trim()
        : null;
    if (!url.startsWith('https://')) throw new Error('invalid_url');
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== 'https:') throw new Error('invalid_url');
    const existing = await db
      .select()
      .from(rss_feeds)
      .where(eq(rss_feeds.url, url))
      .get();
    if (existing) throw new Error('feed_exists');
    const rows = await db
      .insert(rss_feeds)
      .values({ url, name, active: 1, created_at: Date.now() })
      .returning()
      .run();
    if (!rows || !rows[0]) throw new Error('add_feed_failed');
    return rows[0];
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    if (err && ['invalid_url', 'feed_exists', 'add_feed_failed'].includes(err.message)) {
      throw err;
    }
    throw new Error('add_feed_failed');
  }
}
