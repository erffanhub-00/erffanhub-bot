// Shared database helpers: settings key/value store, feed seeding and
// channel bookkeeping. Single implementation used by both handlers.

import { db } from 'sdk';
import { eq } from 'sdk/db';
import { settings, rss_feeds } from '../schema.js';
import { DEFAULT_FEEDS } from './config.js';

export async function getSetting(key) {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  const existing = await getSetting(key);
  if (existing === null) {
    await db.insert(settings).values({ key, value }).run();
  } else {
    await db.update(settings).set({ value }).where(eq(settings.key, key)).run();
  }
}

export async function deleteSetting(key) {
  await db.delete(settings).where(eq(settings.key, key)).run();
}

// All feeds, seeding the three verified defaults when the table is empty.
export async function seedFeedsIfEmpty() {
  const existing = await db.select().from(rss_feeds).all();
  if (existing.length > 0) return existing;
  const now = Date.now();
  for (const feed of DEFAULT_FEEDS) {
    await db
      .insert(rss_feeds)
      .values({ url: feed.url, name: feed.name, active: 1, created_at: now })
      .run();
  }
  return db.select().from(rss_feeds).all();
}

// The channel the bot may publish to (set by my_chat_member when the bot
// becomes a channel admin). Returns { id, title } or null.
export async function getChannel() {
  const id = await getSetting('channel_id');
  if (!id) return null;
  const title = await getSetting('channel_title');
  return { id, title: title || null };
}
