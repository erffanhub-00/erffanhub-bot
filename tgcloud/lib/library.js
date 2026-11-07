// Shared library logic: force-join checks, file search, owner stats.
// Ingest orchestration (pending title/bundle/update states) lives in
// handlers/message.js; this file holds the reusable pieces.

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { CHANNEL_ID, GROUP_ID, DB_GROUP_ID } from './config.js';
import { isMemberStatus, searchFiles, aggregateDownloads, countNewUsers } from './pure.js';
import { files, file_parts, downloads, users } from '../schema.js';
import { listFiles, getAllParts, listDownloads, listUsers, getFile, getParts, getVersions, recordDownload } from './store.js';

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
// phone prompt). Returns { ok } or { error }.
export async function deliverParts(chatId, file, version, parts, user, removeKeyboard) {
  if (!parts || parts.length === 0) {
    return { error: 'این فایل پارتی ندارد.' };
  }
  const title = file.title || '(بدون عنوان)';
  for (const [i, p] of parts.entries()) {
    const caption = `پارت ${i + 1} از ${parts.length} — ${title} v${version}`;
    const replyMarkup =
      removeKeyboard && i === 0 ? { remove_keyboard: true } : undefined;
    try {
      if (p.kind === 'photo' || file.kind === 'photo') {
        await api.sendPhoto({ chat_id: chatId, photo: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      } else if (p.kind === 'video') {
        await api.sendVideo({ chat_id: chatId, video: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      } else if (p.kind === 'audio') {
        await api.sendAudio({ chat_id: chatId, audio: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      } else if (p.kind === 'voice') {
        await api.sendVoice({ chat_id: chatId, voice: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
      } else {
        await api.sendDocument({ chat_id: chatId, document: p.tg_file_id, caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
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

// Owner stats: files section + users section. All numbers come from
// the stored tables — nothing is asked from anyone.
export async function getStatsData() {
  const now = Date.now();
  const allFiles = await listFiles();
  const allParts = await db.select().from(file_parts).all();
  const allDownloads = await listDownloads();
  const allUsers = await listUsers();
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
  return {
    filesTotal: allFiles.length,
    partsTotal: allParts.length,
    sizeTotal: allFiles.reduce((s, f) => s + (Number(f.size_total) || 0), 0),
    downloadsTotal: allDownloads.length,
    usersTotal: allUsers.length,
    usersToday: countNewUsers(allUsers, now, 24 * 60 * 60 * 1000),
    usersWeek: countNewUsers(allUsers, now, 7 * 24 * 60 * 60 * 1000),
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
