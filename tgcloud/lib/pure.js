// Pure helpers with no 'sdk' import, so they can be tested under
// plain Node. Moved here from lib/worker.js during integration.

// Normalize a URL for dedupe: lowercase scheme+host, drop tracking
// params (utm_*, fbclid, gclid) and the fragment, strip a trailing slash.
// Returns the trimmed input unchanged when it does not parse as a URL.
export function normalizeUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return raw;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  for (const key of [...parsed.searchParams.keys()]) {
    if (key === 'fbclid' || key === 'gclid' || key.startsWith('utm_')) {
      parsed.searchParams.delete(key);
    }
  }
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  parsed.hash = '';
  return parsed.toString();
}

const YOUTUBE_RE =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^ \s]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{6,}/i;

// True when the text contains a YouTube watch, Shorts, embed, live or
// youtu.be link.
export function isYouTubeUrl(text) {
  return YOUTUBE_RE.test(String(text ?? ''));
}

// First YouTube URL found in the text, or null.
export function extractYouTubeUrl(text) {
  const urls = String(text ?? '').match(/https?:\/\/[^\s)\]]+/g) || [];
  for (const url of urls) {
    const clean = url.replace(/[.,!?;]+$/, '');
    if (isYouTubeUrl(clean)) return clean;
  }
  return null;
}

// Tehran wall-clock helpers. Tehran has no daylight saving since 2022,
// but the offset is still derived from Intl so the conversion stays
// correct if that ever changes.
const TEHRAN_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function tehranParts(utcMs) {
  const parts = {};
  for (const { type, value } of TEHRAN_FORMAT.formatToParts(new Date(utcMs))) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
}

function tehranOffsetMs(utcMs) {
  const p = tehranParts(utcMs);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs
  );
}

function tehranWallToUtcMs(year, month, day, hour, minute) {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const once = wallAsUtc - tehranOffsetMs(wallAsUtc);
  return wallAsUtc - tehranOffsetMs(once);
}

function isRealDate(year, month, day) {
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

// Parse "YYYY-MM-DD HH:mm" or "HH:mm" (today, Tehran time).
// Returns epoch ms UTC, or null when the format or the date is invalid.
export function parseTehranDateTime(text) {
  const raw = String(text ?? '').trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(raw);
  if (full) {
    const year = Number(full[1]);
    const month = Number(full[2]);
    const day = Number(full[3]);
    const hour = Number(full[4]);
    const minute = Number(full[5]);
    if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
    if (!isRealDate(year, month, day)) return null;
    return tehranWallToUtcMs(year, month, day, hour, minute);
  }
  const short = /^(\d{2}):(\d{2})$/.exec(raw);
  if (short) {
    const hour = Number(short[1]);
    const minute = Number(short[2]);
    if (hour > 23 || minute > 59) return null;
    const today = tehranParts(Date.now());
    return tehranWallToUtcMs(today.year, today.month, today.day, hour, minute);
  }
  return null;
}
