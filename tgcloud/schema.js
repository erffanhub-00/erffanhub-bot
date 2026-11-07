import { table, integer, text, sql } from 'sdk/db';

// ErffanHub Files v2.3 database. No foreign keys: the runtime runs with
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

// Messages that delete themselves: delivered files (60s) and one-off
// notices (20s). Rows are removed after the delete is attempted,
// whether it worked or not — a message deleted by its reader, or one
// Telegram refuses, must not be retried forever. The table is only
// swept when an update arrives (there is no timer on Serverless),
// so a message disappears on the next use of the bot at the earliest.
// (v2.2 adds the Worker cron + the cleanup endpoint, and the v2.3
// dashboard calls cleanup every 30s while it is open.)
export const expiring_messages = table('expiring_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chat_id: integer('chat_id'),
  message_id: integer('message_id'),
  // Epoch milliseconds when the message may be deleted.
  delete_at: integer('delete_at'),
  // 'file' (a delivered file part) or 'notice' (a one-off message).
  kind: text('kind'),
});

// Support messages from users, stored so the owner's dashboard has
// an inbox (the bot also forwards each one to the owner in Telegram).
// Media is NOT stored here — only the kind and the text/caption, so
// no file bytes or bot-token-exposing links ever leave the server.
// A reply is sent from the dashboard (or from the forwarded message's
// reply button) and marks the row answered.
export const support_messages = table('support_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id'),
  username: text('username'),
  // 'text' | 'photo' | 'document' | 'other'.
  kind: text('kind'),
  text: text('text'),
  answered: integer('answered').notNull().default(0),
  created_at: integer('created_at').default(sql`(unixepoch())`),
});
