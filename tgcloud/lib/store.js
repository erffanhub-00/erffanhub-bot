// Shared database helpers: settings key/value store, user tracking,
// file library CRUD, downloads and the GitHub cache. Single
// implementation used by both handlers.

import { db } from 'sdk';
import { eq } from 'sdk/db';
import { settings, users, downloads, files, file_parts, file_versions, github_cache, wallet_transactions } from '../schema.js';
import { buildUserRow, nextFileId, groupCategories } from './pure.js';

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

// --- Users: one row per Telegram user, upserted on every interaction.
// Everything stored comes from the Telegram update itself. ---
export async function getUser(userId) {
  if (!userId) return null;
  return db.select().from(users).where(eq(users.user_id, Number(userId))).get();
}

export async function trackUser(from, isMember) {
  if (!from?.id) return null;
  const existing = await getUser(from.id);
  const row = buildUserRow(from, existing || null, Date.now(), isMember);
  if (existing) {
    await db
      .update(users)
      .set({
        username: row.username,
        first_name: row.first_name,
        last_name: row.last_name,
        language_code: row.language_code,
        is_premium: row.is_premium,
        phone: row.phone,
        last_seen: row.last_seen,
        is_member: row.is_member,
      })
      .where(eq(users.user_id, row.user_id))
      .run();
  } else {
    await db.insert(users).values(row).run();
  }
  return row;
}

export async function listUsers() {
  const rows = await db.select().from(users).all();
  return rows.sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0));
}

// Change a file's price (owner only, /setprice in the DB group).
// 0 means free. Returns the updated file.
export async function setFilePrice(fileId, price) {
  const p = Math.max(0, Number(price) || 0);
  await db
    .update(files)
    .set({ price: p, updated_at: Date.now() })
    .where(eq(files.id, fileId))
    .run();
  return getFile(fileId);
}

// --- Wallet: balances and the transaction ledger ---

export async function getUserBalance(userId) {
  const user = await getUser(userId);
  return Number(user?.balance) || 0;
}

// Change a user's balance by delta (negative spends). The balance
// never goes below zero; returns the new balance.
export async function adjustUserBalance(userId, delta) {
  const user = await getUser(userId);
  if (!user) return 0;
  const next = Math.max(0, (Number(user.balance) || 0) + (Number(delta) || 0));
  await db
    .update(users)
    .set({ balance: next })
    .where(eq(users.user_id, Number(userId)))
    .run();
  return next;
}

export async function insertTransaction({ userId, username, kind, amount, fileId, status, receiptFileId, receiptChatId, receiptMessageId }) {
  const now = Date.now();
  // No returning(): callers find the row later by receipt_message_id.
  await db
    .insert(wallet_transactions)
    .values({
      user_id: userId ?? null,
      username: username ?? null,
      kind,
      amount: Number(amount) || 0,
      file_id: fileId ?? null,
      status: status || 'pending',
      receipt_file_id: receiptFileId ?? null,
      receipt_chat_id: receiptChatId ?? null,
      receipt_message_id: receiptMessageId ?? null,
      created_at: now,
      decided_at: null,
    })
    .run();
  return null;
}

// Find a top-up by its receipts-group message id — the approve /
// reject buttons carry that id, so no insert id is ever needed.
export async function getTransactionByReceiptMessage(messageId) {
  if (!messageId) return null;
  return db
    .select()
    .from(wallet_transactions)
    .where(eq(wallet_transactions.receipt_message_id, Number(messageId)))
    .get();
}

export async function updateTransactionStatus(id, status) {
  await db
    .update(wallet_transactions)
    .set({ status, decided_at: Date.now() })
    .where(eq(wallet_transactions.id, Number(id)))
    .run();
}

export async function listTransactions() {
  const rows = await db.select().from(wallet_transactions).all();
  return rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

export async function listUserTransactions(userId) {
  const rows = await db
    .select()
    .from(wallet_transactions)
    .where(eq(wallet_transactions.user_id, Number(userId)))
    .all();
  return rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

export async function getPendingReceipts() {
  const rows = await db
    .select()
    .from(wallet_transactions)
    .where(eq(wallet_transactions.status, 'pending'))
    .all();
  return rows.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}

// --- Files ---

// Next library id from the stored counter (F001, F002, ...).
export async function takeNextFileId() {
  const current = Number((await getSetting('file_counter')) || 0);
  const id = nextFileId(current);
  await setSetting('file_counter', String(current + 1));
  return id;
}

// Distinct categories with counts, most files first.
export async function listCategories() {
  return groupCategories(await listFiles());
}

// Change a file's category (owner only, /setcat in the DB group).
export async function setFileCategory(fileId, category) {
  const name = String(category || '').trim() || 'سایر';
  await db
    .update(files)
    .set({ category: name, updated_at: Date.now() })
    .where(eq(files.id, fileId))
    .run();
  return getFile(fileId);
}

// Save a phone number the user shared on download (optional, never
// requested as a condition). Never clears an existing number.
export async function setUserPhone(userId, phone) {
  const number = String(phone || '').trim();
  if (!number) return getUser(userId);
  await db
    .update(users)
    .set({ phone: number })
    .where(eq(users.user_id, Number(userId)))
    .run();
  return getUser(userId);
}

export async function listFiles() {
  const rows = await db.select().from(files).all();
  return rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

export async function getFile(id) {
  if (!id) return null;
  return db.select().from(files).where(eq(files.id, String(id).toUpperCase())).get();
}

export async function getParts(fileId, version) {
  const rows = await db.select().from(file_parts).where(eq(file_parts.file_id, fileId)).all();
  return rows
    .filter((p) => Number(p.version) === Number(version))
    .sort((a, b) => (a.part_no || 0) - (b.part_no || 0));
}

export async function getVersions(fileId) {
  const rows = await db.select().from(file_versions).where(eq(file_versions.file_id, fileId)).all();
  return rows.sort((a, b) => (a.version || 0) - (b.version || 0));
}

export async function getAllParts(fileId) {
  const rows = await db.select().from(file_parts).where(eq(file_parts.file_id, fileId)).all();
  return rows.sort((a, b) => (a.version - b.version) || (a.part_no - b.part_no));
}

// Insert a new file (version 1) with its parts, plus the v1 snapshot.
export async function insertFile({ id, title, description, category, kind, parts, dbChatId, dbMessageId, createdAt, price }) {
  const now = createdAt || Date.now();
  const sizeTotal = parts.reduce((sum, p) => sum + (Number(p.size) || 0), 0);
  await db
    .insert(files)
    .values({
      id,
      title: title || null,
      description: description || null,
      category: (category || 'سایر').trim() || 'سایر',
      price: Math.max(0, Number(price) || 0),
      version: 1,
      kind: kind || parts[0]?.kind || null,
      size_total: sizeTotal,
      parts_count: parts.length,
      downloads: 0,
      created_at: now,
      updated_at: now,
      db_chat_id: dbChatId ?? null,
      db_message_id: dbMessageId ?? null,
    })
    .run();
  for (const [i, p] of parts.entries()) {
    await db
      .insert(file_parts)
      .values({
        file_id: id,
        version: 1,
        part_no: i + 1,
        tg_file_id: p.tg_file_id,
        tg_unique_id: p.tg_unique_id || null,
        file_name: p.file_name || null,
        mime: p.mime || null,
        size: p.size ?? null,
        width: p.width ?? null,
        height: p.height ?? null,
        duration: p.duration ?? null,
        db_message_id: p.db_message_id ?? null,
      })
      .run();
  }
  await db
    .insert(file_versions)
    .values({ file_id: id, version: 1, title: title || null, description: description || null, created_at: now })
    .run();
  return getFile(id);
}

// Create a new version of an existing file (old parts stay retrievable).
export async function insertVersion(file, parts, { title, description }) {
  const newVersion = (Number(file.version) || 1) + 1;
  const now = Date.now();
  const sizeTotal = parts.reduce((sum, p) => sum + (Number(p.size) || 0), 0);
  // Snapshot the OLD version's title/description before overwriting.
  const oldSnapshot = await db
    .select()
    .from(file_versions)
    .where(eq(file_versions.file_id, file.id))
    .all();
  if (!oldSnapshot.some((v) => Number(v.version) === Number(file.version))) {
    await db
      .insert(file_versions)
      .values({
        file_id: file.id,
        version: Number(file.version) || 1,
        title: file.title || null,
        description: file.description || null,
        created_at: Number(file.created_at) || now,
      })
      .run();
  }
  for (const [i, p] of parts.entries()) {
    await db
      .insert(file_parts)
      .values({
        file_id: file.id,
        version: newVersion,
        part_no: i + 1,
        tg_file_id: p.tg_file_id,
        tg_unique_id: p.tg_unique_id || null,
        file_name: p.file_name || null,
        mime: p.mime || null,
        size: p.size ?? null,
        width: p.width ?? null,
        height: p.height ?? null,
        duration: p.duration ?? null,
        db_message_id: p.db_message_id ?? null,
      })
      .run();
  }
  await db
    .update(files)
    .set({
      title: title ?? file.title,
      description: description ?? file.description,
      version: newVersion,
      kind: parts[0]?.kind || file.kind,
      size_total: sizeTotal,
      parts_count: parts.length,
      updated_at: now,
    })
    .where(eq(files.id, file.id))
    .run();
  await db
    .insert(file_versions)
    .values({ file_id: file.id, version: newVersion, title: title ?? file.title, description: description ?? file.description, created_at: now })
    .run();
  return getFile(file.id);
}

// Create the file (or a new version) from a pending ingest state.
// Shared by the message handler (title/price intake) and the callback
// handler (free/premium buttons). The id is assigned by the caller.
export async function finalizeIngest(state, id, title, description, price) {
  if (state.mode === 'update') {
    const file = await getFile(state.fileId);
    if (!file) return null;
    return insertVersion(file, state.parts, { title, description });
  }
  return insertFile({
    id,
    title,
    description,
    category: state.category || 'سایر',
    kind: state.kind,
    parts: state.parts,
    dbChatId: state.dbChatId,
    dbMessageId: state.dbMessageId,
    price: price || 0,
  });
}

// Delete a file and all its parts/versions/downloads rows. The Telegram
// messages in the DB group stay (harmless).
export async function deleteFile(id) {
  await db.delete(file_parts).where(eq(file_parts.file_id, id)).run();
  await db.delete(file_versions).where(eq(file_versions.file_id, id)).run();
  await db.delete(downloads).where(eq(downloads.file_id, id)).run();
  await db.delete(files).where(eq(files.id, id)).run();
}

// --- Downloads ---
export async function recordDownload(fileId, version, user) {
  await db
    .insert(downloads)
    .values({
      file_id: fileId,
      version: Number(version) || 1,
      user_id: user?.id ?? null,
      username: user?.username ?? null,
      downloaded_at: Date.now(),
    })
    .run();
  const file = await getFile(fileId);
  if (file) {
    await db
      .update(files)
      .set({ downloads: (Number(file.downloads) || 0) + 1 })
      .where(eq(files.id, fileId))
      .run();
  }
}

export async function listDownloads() {
  const rows = await db.select().from(downloads).all();
  return rows.sort((a, b) => (b.downloaded_at || 0) - (a.downloaded_at || 0));
}

export async function getUserDownloads(userId) {
  const rows = await db.select().from(downloads).where(eq(downloads.user_id, Number(userId))).all();
  return rows.sort((a, b) => (b.downloaded_at || 0) - (a.downloaded_at || 0));
}

// --- GitHub cache (one row, id = 1) ---
export async function getGithubCache() {
  return db.select().from(github_cache).where(eq(github_cache.id, 1)).get();
}

export async function setGithubCache(body) {
  const existing = await getGithubCache();
  if (existing) {
    await db
      .update(github_cache)
      .set({ body, fetched_at: Date.now() })
      .where(eq(github_cache.id, 1))
      .run();
  } else {
    await db.insert(github_cache).values({ id: 1, body, fetched_at: Date.now() }).run();
  }
}
