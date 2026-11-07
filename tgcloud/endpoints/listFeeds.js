import { db, EndpointError } from 'sdk';
import { rss_feeds } from '../schema.js';
import { isOwner } from '../lib/auth.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// All RSS feeds, oldest first.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const rows = await db.select().from(rss_feeds).all();
    rows.sort((a, b) => a.id - b.id);
    return rows;
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    throw new Error('list_feeds_failed');
  }
}
