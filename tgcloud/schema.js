import { table, integer, text, sql } from 'sdk/db';

// ErffanHub Files v1 database. No foreign keys: the runtime runs with
// PRAGMA foreign_keys off, so integrity is the application's job.
// Timestamps are epoch milliseconds (Date.now()) unless noted.
// User data: everything stored about a user comes from what Telegram
// already gives the bot in the update (id, username, name, language,
// is_premium) plus what the user does in the bot. The bot never asks a
// user for personal information and never requests contact/location.

export const settings = table('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

// One row per file (latest version info lives here; old versions live
// in file_versions + file_parts with their version number).
export const files = table('files', {
  id: text('id').primaryKey(),
  title: text('title'),
  description: text('description'),
  // Owner-chosen category; «سایر» when skipped.
  category: text('category'),
  // Price in Toman. 0 = free; above 0 = premium (paid from the wallet).
  price: integer('price').notNull().default(0),
  version: integer('version').notNull().default(1),
  kind: text('kind'),
  size_total: integer('size_total'),
  parts_count: integer('parts_count').notNull().default(1),
  downloads: integer('downloads').notNull().default(0),
  created_at: integer('created_at').default(sql`(unixepoch())`),
  updated_at: integer('updated_at'),
  db_chat_id: integer('db_chat_id'),
  db_message_id: integer('db_message_id'),
});

// One row per part of a file version. The Telegram file_id is all the
// bot needs to send the file again — no re-upload, no stored bytes.
export const file_parts = table('file_parts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  file_id: text('file_id'),
  version: integer('version').notNull().default(1),
  part_no: integer('part_no').notNull().default(1),
  tg_file_id: text('tg_file_id'),
  tg_unique_id: text('tg_unique_id'),
  file_name: text('file_name'),
  mime: text('mime'),
  size: integer('size'),
  width: integer('width'),
  height: integer('height'),
  duration: integer('duration'),
  db_message_id: integer('db_message_id'),
});

// Snapshot of a file's title/description when a new version is created.
export const file_versions = table('file_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  file_id: text('file_id'),
  version: integer('version'),
  title: text('title'),
  description: text('description'),
  created_at: integer('created_at').default(sql`(unixepoch())`),
});

// One row per file delivery (not per part).
export const downloads = table('downloads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  file_id: text('file_id'),
  version: integer('version'),
  user_id: integer('user_id'),
  username: text('username'),
  downloaded_at: integer('downloaded_at'),
});

// Wallet ledger: card-to-card top-ups (kind 'charge', status starts
// 'pending' until the owner approves the receipt in the receipts
// group) and premium file purchases (kind 'purchase', status
// 'approved' immediately). Amount is signed: charges positive,
// purchases negative. Rows are never deleted — money history stays.
export const wallet_transactions = table('wallet_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id'),
  username: text('username'),
  kind: text('kind'),
  amount: integer('amount'),
  file_id: text('file_id'),
  status: text('status'),
  receipt_file_id: text('receipt_file_id'),
  receipt_chat_id: integer('receipt_chat_id'),
  receipt_message_id: integer('receipt_message_id'),
  created_at: integer('created_at').default(sql`(unixepoch())`),
  decided_at: integer('decided_at'),
});

// One row per Telegram user that ever interacted with the bot.
// Every column comes from the Telegram update itself; first_seen is set
// once, last_seen and is_member are updated on every interaction.
export const users = table('users', {
  user_id: integer('user_id').primaryKey(),
  username: text('username'),
  first_name: text('first_name'),
  last_name: text('last_name'),
  language_code: text('language_code'),
  is_premium: integer('is_premium').notNull().default(0),
  // Optional phone, shared by the user on download (never requested
  // as a condition — delivery never waits for it). Null = never shared.
  phone: text('phone'),
  // Wallet balance in Toman. Topped up by card-to-card receipts the
  // owner approves; premium file prices are deducted from it.
  balance: integer('balance').notNull().default(0),
  first_seen: integer('first_seen'),
  last_seen: integer('last_seen'),
  is_member: integer('is_member'),
});

// One row (id = 1): last good GitHub API response, so the projects
// screen still works when GitHub is unreachable.
export const github_cache = table('github_cache', {
  id: integer('id').primaryKey(),
  body: text('body'),
  fetched_at: integer('fetched_at'),
});
