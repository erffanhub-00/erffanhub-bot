import { table, integer, text, sql } from 'sdk/db';

// ErffanHub v2 database. No foreign keys: the runtime runs with
// PRAGMA foreign_keys off, so integrity is the application's job.
// Timestamps are epoch milliseconds (Date.now()), except created_at
// defaults below which use unixepoch() (seconds) only when the code
// does not set the value explicitly. Code always sets them explicitly.

export const settings = table('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

export const rss_feeds = table('rss_feeds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull().unique(),
  name: text('name'),
  active: integer('active').notNull().default(1),
  created_at: integer('created_at').default(sql`(unixepoch())`),
  last_fetched_at: integer('last_fetched_at'),
  last_error: text('last_error'),
});

export const news_items = table('news_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  feed_id: integer('feed_id'),
  guid: text('guid').unique(),
  title: text('title'),
  link: text('link'),
  description: text('description'),
  published_at: integer('published_at'),
  fetched_at: integer('fetched_at'),
  // new | selected | discarded
  status: text('status'),
});

export const drafts = table('drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // news | youtube
  kind: text('kind'),
  title: text('title'),
  body: text('body'),
  media_url: text('media_url'),
  source_url: text('source_url'),
  button_text: text('button_text'),
  button_url: text('button_url'),
  news_item_id: integer('news_item_id'),
  // draft | scheduled | published, plus discarded (row kept for history)
  status: text('status'),
  // epoch ms UTC, only when status is scheduled
  publish_at: integer('publish_at'),
  created_at: integer('created_at').default(sql`(unixepoch())`),
});

export const publish_log = table('publish_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  draft_id: integer('draft_id'),
  channel_id: integer('channel_id'),
  message_id: integer('message_id'),
  published_at: integer('published_at'),
});
