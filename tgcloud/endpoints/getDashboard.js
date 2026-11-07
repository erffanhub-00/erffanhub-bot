import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { settings, rss_feeds, news_items, drafts } from '../schema.js';
import { isOwner } from '../lib/auth.js';

async function getSetting(key) {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? row.value : null;
}

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Dashboard summary: inbox counts, drafts by status, channel, feeds.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const newsNew = await db.$count(news_items, eq(news_items.status, 'new'));
    const newsSelected = await db.$count(
      news_items,
      eq(news_items.status, 'selected'),
    );
    const allDrafts = await db.select().from(drafts).all();
    const byStatus = { draft: 0, scheduled: 0, published: 0, discarded: 0 };
    for (const d of allDrafts) {
      if (Object.prototype.hasOwnProperty.call(byStatus, d.status)) {
        byStatus[d.status] += 1;
      }
    }
    const feedsCount = await db.$count(rss_feeds);
    const channelTitle = await getSetting('channel_title');
    return {
      news: { new: newsNew, selected: newsSelected },
      drafts: byStatus,
      scheduled: byStatus.scheduled,
      channelTitle: channelTitle || null,
      feeds: feedsCount,
    };
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    throw new Error('dashboard_failed');
  }
}
