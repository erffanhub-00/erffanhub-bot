// Pure helpers with no 'sdk' import, so they can be tested under
// plain Node.

// Pagination over an in-memory list (1-based page numbers in the UI,
// 0-based in code). Returns the slice for the page plus totals, with
// the page clamped into range.
export function paginate(items, page, perPage) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, perPage | 0 || 1);
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const safePage = Math.min(Math.max(0, page | 0 || 0), totalPages - 1);
  const start = safePage * size;
  return {
    pageItems: list.slice(start, start + size),
    page: safePage,
    totalPages,
    total: list.length,
  };
}

// Human-readable byte size, Persian units.
export function formatBytes(size) {
  if (size === null || size === undefined || size === '') return '—';
  const n = Number(size);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} بایت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} کیلوبایت`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} مگابایت`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} گیگابایت`;
}

// Next library id from the current counter value (0 = none yet):
// 0 -> F001, 7 -> F008. Pads to 3 digits, grows past F999 naturally.
export function nextFileId(counter) {
  const n = (Number(counter) || 0) + 1;
  return 'F' + String(n).padStart(3, '0');
}

// Convert Persian (۰-۹) and Arabic (٠-٩) digits to ASCII digits.
export function normalizeDigits(text) {
  return String(text ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

// Parse a file id from user text: "F001", "f12", "/get F003" (Persian
// digits work too: "F۲۵"). File ids are always auto-sequential — the
// bot never asks for a number. Returns the normalized id or null.
export function parseFileId(text) {
  const normalized = normalizeDigits(text);
  const m = /F(\d{1,6})/i.exec(normalized);
  if (!m) return null;
  return 'F' + String(Number(m[1])).padStart(3, '0');
}

// Split the owner's title/description message: first line is the
// title, the rest is the description. Returns { title, description }.
export function parseTitleDescription(text) {
  const lines = String(text ?? '').split('\n');
  const title = (lines[0] || '').trim();
  const description = lines.slice(1).join('\n').trim();
  return { title, description: description || null };
}

// Group files by category: [{ name, count }], most files first, then
// by name. Missing category reads as «سایر».
export function groupCategories(fileRows) {
  const counts = {};
  for (const f of Array.isArray(fileRows) ? fileRows : []) {
    const name = (f.category || 'سایر').trim() || 'سایر';
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fa'));
}

// Category options for the owner's ingest prompt: existing categories
// (most files first) with «سایر» appended when it is not among them.
export function categoryOptions(fileRows) {
  const names = groupCategories(fileRows).map((g) => g.name);
  if (!names.includes('سایر')) names.push('سایر');
  return names;
}

// True when the bot should offer the optional phone share before a
// download: the user has never shared a phone. The phone is optional
// — delivery never waits for it.
export function needsPhonePrompt(userRow) {
  return !userRow || !userRow.phone;
}

// Extract the file metadata Telegram already gives us from an incoming
// message. Returns null when the message carries no file. The result is
// a part descriptor ready for the file_parts table — the owner is never
// asked for any of this. Photo takes the largest size (best quality).
export function extractFileMeta(message) {
  if (!message || typeof message !== 'object') return null;
  const date = message.date ? Number(message.date) * 1000 : Date.now();
  const base = { date, db_message_id: message.message_id ?? null };
  if (message.document) {
    const d = message.document;
    return {
      ...base,
      kind: 'document',
      tg_file_id: d.file_id,
      tg_unique_id: d.file_unique_id || null,
      file_name: d.file_name || null,
      mime: d.mime_type || null,
      size: typeof d.file_size === 'number' ? d.file_size : null,
      width: null,
      height: null,
      duration: null,
    };
  }
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const sizes = [...message.photo].sort(
      (a, b) => (b.file_size || 0) - (a.file_size || 0),
    );
    const p = sizes[0];
    return {
      ...base,
      kind: 'photo',
      tg_file_id: p.file_id,
      tg_unique_id: p.file_unique_id || null,
      file_name: `photo_${p.file_unique_id || 'file'}.jpg`,
      mime: 'image/jpeg',
      size: typeof p.file_size === 'number' ? p.file_size : null,
      width: p.width ?? null,
      height: p.height ?? null,
      duration: null,
    };
  }
  if (message.video) {
    const v = message.video;
    return {
      ...base,
      kind: 'video',
      tg_file_id: v.file_id,
      tg_unique_id: v.file_unique_id || null,
      file_name: v.file_name || `video_${v.file_unique_id || 'file'}.mp4`,
      mime: v.mime_type || 'video/mp4',
      size: typeof v.file_size === 'number' ? v.file_size : null,
      width: v.width ?? null,
      height: v.height ?? null,
      duration: typeof v.duration === 'number' ? v.duration : null,
    };
  }
  if (message.audio) {
    const a = message.audio;
    return {
      ...base,
      kind: 'audio',
      tg_file_id: a.file_id,
      tg_unique_id: a.file_unique_id || null,
      file_name: a.file_name || `audio_${a.file_unique_id || 'file'}.mp3`,
      mime: a.mime_type || 'audio/mpeg',
      size: typeof a.file_size === 'number' ? a.file_size : null,
      width: null,
      height: null,
      duration: typeof a.duration === 'number' ? a.duration : null,
    };
  }
  if (message.voice) {
    const v = message.voice;
    return {
      ...base,
      kind: 'voice',
      tg_file_id: v.file_id,
      tg_unique_id: v.file_unique_id || null,
      file_name: `voice_${v.file_unique_id || 'file'}.ogg`,
      mime: v.mime_type || 'audio/ogg',
      size: typeof v.file_size === 'number' ? v.file_size : null,
      width: null,
      height: null,
      duration: typeof v.duration === 'number' ? v.duration : null,
    };
  }
  if (message.animation) {
    const a = message.animation;
    return {
      ...base,
      kind: 'document',
      tg_file_id: a.file_id,
      tg_unique_id: a.file_unique_id || null,
      file_name: a.file_name || `animation_${a.file_unique_id || 'file'}.mp4`,
      mime: a.mime_type || 'video/mp4',
      size: typeof a.file_size === 'number' ? a.file_size : null,
      width: a.width ?? null,
      height: a.height ?? null,
      duration: typeof a.duration === 'number' ? a.duration : null,
    };
  }
  return null;
}

// Search files by name: case-insensitive substring over title,
// description, category and every part file name. `file` carries
// { title, description, category, fileNames: [] }. Empty query
// matches nothing.
export function searchFiles(files, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const list = Array.isArray(files) ? files : [];
  return list.filter((f) => {
    const hay = [
      f.title || '',
      f.description || '',
      f.category || '',
      ...(Array.isArray(f.fileNames) ? f.fileNames : []),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

// Map a getChatMember status to force-join membership. creator /
// administrator / member / restricted are members; left / kicked are
// not. Unknown statuses are treated as not a member (fail closed).
export function isMemberStatus(status) {
  return (
    status === 'creator' ||
    status === 'administrator' ||
    status === 'member' ||
    status === 'restricted'
  );
}

// Build the users-table row from a Telegram `from` object (everything
// Telegram already provides — never anything the user was asked for).
// `existing` is the stored row or null; `nowMs` is the interaction
// time. first_seen is set once and never overwritten; is_member is
// only overwritten when a fresh value is given (null keeps the old).
export function buildUserRow(from, existing, nowMs, isMember) {
  const now = Number(nowMs) || Date.now();
  const base = existing || {};
  return {
    user_id: from?.id ?? base.user_id,
    username: from?.username ?? base.username ?? null,
    first_name: from?.first_name ?? base.first_name ?? null,
    last_name: from?.last_name ?? base.last_name ?? null,
    language_code: from?.language_code ?? base.language_code ?? null,
    is_premium: from?.is_premium ? 1 : 0,
    // The phone is only ever set from a shared contact (see
    // setUserPhone); an interaction never clears it.
    phone: base.phone ?? null,
    first_seen: base.first_seen ?? now,
    last_seen: now,
    is_member:
      isMember === null || isMember === undefined ? (base.is_member ?? null) : isMember ? 1 : 0,
  };
}

// Aggregate download rows into per-file counts: { fileId: { count,
// lastAt } }. Rows are { file_id, downloaded_at }.
export function aggregateDownloads(rows) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = r.file_id;
    if (!id) continue;
    const at = Number(r.downloaded_at) || 0;
    if (!out[id]) out[id] = { count: 0, lastAt: 0 };
    out[id].count += 1;
    if (at > out[id].lastAt) out[id].lastAt = at;
  }
  return out;
}

// Count users whose first_seen is within the last `windowMs` before
// `nowMs` (e.g. 24h / 7d for "new users").
export function countNewUsers(userRows, nowMs, windowMs) {
  const cutoff = nowMs - windowMs;
  return (Array.isArray(userRows) ? userRows : []).filter(
    (u) => Number(u.first_seen) >= cutoff,
  ).length;
}

// Parse a GitHub /users/:user/repos response: drop forks, newest
// first, keep only what the projects screen shows.
export function parseGitHubRepos(json) {
  const list = Array.isArray(json) ? json : [];
  return list
    .filter((r) => r && !r.fork)
    .map((r) => ({
      name: r.name || '',
      description: r.description || null,
      language: r.language || null,
      stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : 0,
      url: r.html_url || '',
      updated_at: r.updated_at || null,
    }))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}
