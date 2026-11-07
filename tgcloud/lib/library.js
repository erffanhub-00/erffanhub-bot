// Shared library logic: force-join checks, file search, owner stats,
// wallet purchases and receipt handling. Ingest orchestration (pending
// title/bundle/update/price states) lives in handlers/message.js;
// this file holds the reusable pieces.

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { CHANNEL_ID, GROUP_ID, DB_GROUP_ID, RECEIPTS_GROUP_ID } from './config.js';
import { isMemberStatus, searchFiles, searchUsers, aggregateDownloads, countNewUsers, isPremiumFile, canAfford, formatToman, FILE_TTL_SEC, NOTICE_TTL_SEC, expiredRows, fileDownloaders } from './pure.js';
import { files, file_parts, downloads, users } from '../schema.js';
import { listFiles, getAllParts, listDownloads, listUsers, getFile, getParts, getVersions, recordDownload, getUser, getUserBalance, adjustUserBalance, insertTransaction, listTransactions, getPendingReceipts, getSetting, deleteSetting, updateTransactionStatus, recordExpiringMessage, listExpiringMessages, deleteExpiringMessages } from './store.js';

// Check force-join membership for a user. Returns
// { channel: true|false|null, group: true|false|null } — null means
// that chat is not configured yet (id 0), so the check is skipped.
// A failed getChatMember call (bot not admin, chat gone) counts as
// "not a member" and carries the real error in `error`.
export async function checkMembership(userId) {
  const out = { channel: null, group: null, error: null };
  for (const [key, chatId] of [['channel', CHANNEL_ID], ['group', GROUP_ID]]) {
    if (!chatId) continue;
    try {
      const member = await api.getChatMember({ chat_id: chatId, user_id: userId });
      out[key] = isMemberStatus(member?.status);
    } catch (err) {
      out[key] = false;
      out.error =
        err?.description || err?.message || 'بررسی عضویت ممکن نشد.';
    }
  }
  return out;
}

// True when the user passes every configured force-join check.
export function membershipPassed(check) {
  if (check.channel === false || check.group === false) return false;
  return true;
}

// Which checks are missing, for the join screen.
export function missingMembership(check) {
  return { channel: check.channel === false, group: check.group === false };
}

export function isDbGroup(chatId) {
  return !!DB_GROUP_ID && Number(chatId) === Number(DB_GROUP_ID);
}

export function isReceiptsGroup(chatId) {
  return !!RECEIPTS_GROUP_ID && Number(chatId) === Number(RECEIPTS_GROUP_ID);
}

// --- Self-deleting messages ---
// Telegram Serverless has no timer or cron, so expiry is enforced
// lazily: run this on every incoming update. It deletes every
// recorded message whose time has come (best-effort — a message the
// reader already deleted, or one Telegram refuses, is simply
// forgotten) and drops the rows either way. Returns how many rows
// were swept.
export async function runCleanup() {
  let rows;
  try {
    rows = expiredRows(await listExpiringMessages(), Date.now());
  } catch {
    return 0;
  }
  if (rows.length === 0) return 0;
  for (const r of rows) {
    try {
      await api.deleteMessage({ chat_id: r.chat_id, message_id: r.message_id });
    } catch {
      // Already gone, or Telegram refuses — forget the row anyway.
    }
  }
  try {
    await deleteExpiringMessages(rows.map((r) => r.id));
  } catch {
    // Rows left behind are swept on the next update.
  }
  return rows.length;
}

// Send a one-off notice that deletes itself after `seconds`
// (default 20s). The screen is never touched — this is for messages
// that are not navigation. Returns the sent message.
export async function sendExpiring(chatId, text, seconds = NOTICE_TTL_SEC, extra = {}) {
  const sent = await api.sendMessage({ chat_id: chatId, text, ...extra });
  const id = sent?.message_id ?? null;
  if (id) {
    try {
      await recordExpiringMessage(chatId, id, seconds, 'notice');
    } catch {
      // The notice stays; cleanup is best-effort.
    }
  }
  return sent;
}

// File view model shared by both handlers: file row + version
// snapshot (title/description of that version) + its parts + all
// versions for the version buttons. Returns null when missing.
export async function getFileViewModel(fileId, version) {
  const file = await getFile(fileId);
  if (!file) return null;
  const versions = await getVersions(fileId);
  const ver = Number(version) || Number(file.version) || 1;
  const snapshot = versions.find((v) => Number(v.version) === ver);
  const parts = await getParts(fileId, ver);
  const view = {
    ...file,
    version: ver,
    title: snapshot?.title ?? file.title,
    description: snapshot?.description ?? file.description,
  };
  return { view, parts, versions };
}

// Downloads of one file version (for the file view counter).
export async function countDownloads(fileId, version) {
  const rows = await listDownloads();
  return rows.filter(
    (d) => d.file_id === fileId && Number(d.version) === Number(version),
  ).length;
}

// Deliver one file version: each part as its own message, with its
// ORIGINAL file name (the file_id already carries it — nothing is
// renamed). The first part removes the reply keyboard (used for the
// phone prompt). Every part deletes itself 60 seconds after delivery,
// so the chat does not stay cluttered — the reader is told so in the
// caption. Returns { ok } or { error }.
export async function deliverParts(chatId, file, version, parts, user, removeKeyboard) {
  if (!parts || parts.length === 0) {
    return { error: 'این فایل پارتی ندارد.' };
  }
  const title = file.title || '(بدون عنوان)';
  for (const [i, p] of parts.entries()) {
    const caption =
      `پارت ${i + 1} از ${parts.length} — ${title} v${version}\n` +
      '⏳ این پیام بعد از ۱ دقیقه پاک می‌شود.';
    const replyMarkup =
      removeKeyboard && i === 0 ? { remove_keyboard: true } : undefined;
    try {
      let sent = null;
      if (p.kind === 'photo' || file.kind === 'photo') {
        sent = await api.sendPhoto({ chat_id: chatId, photo: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      } else if (p.kind === 'video') {
        sent = await api.sendVideo({ chat_id: chatId, video: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      } else if (p.kind === 'audio') {
        sent = await api.sendAudio({ chat_id: chatId, audio: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      } else if (p.kind === 'voice') {
        sent = await api.sendVoice({ chat_id: chatId, voice: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      } else {
        sent = await api.sendDocument({ chat_id: chatId, document: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      }
      const id = sent?.message_id ?? null;
      if (id) {
        try {
          await recordExpiringMessage(chatId, id, FILE_TTL_SEC, 'file');
        } catch {
          // The file stays; cleanup is best-effort.
        }
      }
    } catch (err) {
      return { error: 'ارسال فایل ممکن نشد: ' + (err?.description || err?.message || 'نامشخص') };
    }
  }
  await recordDownload(file.id, version, user);
  return { ok: true };
}

// Search the whole library by name: title, description and every part
// file name. Returns file rows newest first.
export async function searchLibrary(query) {
  const all = await listFiles();
  const enriched = [];
  for (const f of all) {
    const parts = await getAllParts(f.id);
    enriched.push({
      ...f,
      fileNames: parts.map((p) => p.file_name).filter(Boolean),
    });
  }
  return searchFiles(enriched, query);
}

// --- Wallet ---

// Buy a premium file version from the user's wallet. Free files pass
// through untouched. Returns { ok, free?, price, balance } or
// { error: 'insufficient', price, balance, missing }.
export async function purchaseFile(user, file, version) {
  const price = Number(file.price) || 0;
  if (!isPremiumFile(file)) {
    return { ok: true, free: true, price: 0, balance: await getUserBalance(user.id) };
  }
  const balance = await getUserBalance(user.id);
  if (!canAfford(balance, price)) {
    return { error: 'insufficient', price, balance, missing: price - balance };
  }
  const next = await adjustUserBalance(user.id, -price);
  await insertTransaction({
    userId: user.id,
    username: user.username || null,
    kind: 'purchase',
    amount: -price,
    fileId: file.id,
    status: 'approved',
  });
  return { ok: true, price, balance: next };
}

// Owner stats: files section + users section + wallet section. All
// numbers come from the stored tables — nothing is asked from anyone.
export async function getStatsData() {
  const now = Date.now();
  const allFiles = await listFiles();
  const allParts = await db.select().from(file_parts).all();
  const allDownloads = await listDownloads();
  const allUsers = await listUsers();
  const allTxs = await listTransactions();
  const pending = await getPendingReceipts();
  const perFile = aggregateDownloads(allDownloads);
  const perUserDownloads = {};
  for (const d of allDownloads) {
    if (!d.user_id) continue;
    perUserDownloads[d.user_id] = (perUserDownloads[d.user_id] || 0) + 1;
  }
  const usersWithCounts = allUsers.map((u) => ({
    ...u,
    downloads: perUserDownloads[u.user_id] || 0,
  }));
  const totalCharged = allTxs
    .filter((t) => t.kind === 'charge' && t.status === 'approved')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalPurchased = allTxs
    .filter((t) => t.kind === 'purchase' && t.status === 'approved')
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  return {
    filesTotal: allFiles.length,
    partsTotal: allParts.length,
    sizeTotal: allFiles.reduce((s, f) => s + (Number(f.size_total) || 0), 0),
    downloadsTotal: allDownloads.length,
    usersTotal: allUsers.length,
    usersToday: countNewUsers(allUsers, now, 24 * 60 * 60 * 1000),
    usersWeek: countNewUsers(allUsers, now, 7 * 24 * 60 * 60 * 1000),
    totalCharged,
    totalPurchased,
    pendingReceipts: pending.length,
    recentTransactions: allTxs.slice(0, 10),
    perFile,
    users: usersWithCounts,
    files: allFiles,
    recentDownloads: allDownloads.slice(0, 10),
  };
}

// All users, newest activity first (for the stats users list).
export async function getStatsUsers() {
  return listUsers();
}

// Owner user search: name, username or id.
export async function searchStatsUsers(query) {
  return searchUsers(await listUsers(), query);
}

// Caption for a top-up receipt photo in the receipts group.
export function receiptCaptionText(tx, user) {
  const who = user?.username ? '@' + user.username : `کاربر ${tx.user_id}`;
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || '—';
  return (
    '🧾 رسید شارژ کیف پول\n\n' +
    `کاربر: ${who} — ${name}\n` +
    `آیدی: ${tx.user_id}\n` +
    `مبلغ: ${formatToman(tx.amount)}\n` +
    'وضعیت: در انتظار تایید'
  );
}

// Caption after the owner approves a receipt (buttons removed).
export function receiptApprovedText(tx, user) {
  return receiptCaptionText(tx, user).replace('در انتظار تایید', '✅ تایید شد');
}

// Settle a pending top-up receipt: approve credits the wallet,
// reject does not. Idempotent: a receipt decided already returns
// { status: 'already' } and touches nothing. On approval, a pending
// premium purchase is delivered automatically when the balance now
// covers it; otherwise the user is told how much is still missing.
// Every user-facing send is best-effort (a blocked bot must not
// break the settlement). Returns { status, balance?, delivered? }.
export async function settleReceipt(tx, approve) {
  if (!tx) return { status: 'missing' };
  if (tx.status !== 'pending') return { status: 'already', decided: tx.status };
  const userId = tx.user_id;
  if (approve) {
    await updateTransactionStatus(tx.id, 'approved');
    const balance = await adjustUserBalance(userId, Number(tx.amount) || 0);
    try {
      await sendExpiring(
        userId,
        `کیف پولت ${formatToman(tx.amount)} شارژ شد ✅\nموجودی: ${formatToman(balance)}`,
      );
    } catch {
      // The user may have blocked the bot; the money is still credited.
    }
    // Pending premium purchase? Deliver it now if the balance covers it.
    const pendingRaw = await getSetting(`pending_purchase:${userId}`);
    let delivered = false;
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw);
        if (pending?.fileId) {
          const model = await getFileViewModel(pending.fileId, pending.version || null);
          if (model) {
            const bought = await purchaseFile({ id: userId }, model.view, model.view.version);
            if (bought.ok) {
              const res = await deliverParts(userId, model.view, model.view.version, model.parts, { id: userId }, false);
              if (!res.error) {
                delivered = true;
                await deleteSetting(`pending_purchase:${userId}`);
                try {
                  await sendExpiring(userId, 'فایل برات ارسال شد ✅');
                } catch {
                  // Best-effort notice.
                }
              }
            } else if (bought.error === 'insufficient') {
              try {
                await sendExpiring(
                  userId,
                  `شارژ شد، ولی برای این فایل هنوز ${formatToman(bought.missing)} کم داری.`,
                );
              } catch {
                // Best-effort notice.
              }
            }
          }
        }
      } catch {
        // A broken pending purchase must not break the settlement.
      }
    }
    return { status: 'approved', balance, delivered };
  }
  await updateTransactionStatus(tx.id, 'rejected');
  try {
    await sendExpiring(userId, 'رسیدت تایید نشد. اگر اشتباهی شده، دوباره بفرست.');
  } catch {
    // Best-effort notice.
  }
  return { status: 'rejected' };
}

// Users who downloaded a file (any version), newest download first.
// Used for the "notify this file's users" audience.
export async function getFileDownloaders(fileId) {
  return fileDownloaders(await listDownloads(), fileId);
}

// Send a notification to a list of user ids. One failure (blocked
// bot, deleted account) never stops the rest. Returns { ok, fail }.
export async function sendNotifyToUsers(userIds, text) {
  let ok = 0;
  let fail = 0;
  for (const id of Array.isArray(userIds) ? userIds : []) {
    try {
      await api.sendMessage({ chat_id: id, text });
      ok += 1;
    } catch {
      fail += 1;
    }
  }
  return { ok, fail };
}
