// Pure formatting helpers shared by both handlers. No 'sdk' import.

import { formatBytes, formatToman } from './pure.js';

export { formatBytes, formatToman };

export function truncate(text, max) {
  const s = String(text ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Tehran wall time, Persian locale.
export function formatTehran(ms) {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

const KIND_FA = {
  document: 'فایل',
  photo: 'عکس',
  video: 'ویدیو',
  audio: 'صوتی',
  voice: 'ویس',
};

// One line of file info: "F001 — عنوان (v2، ۳ پارت، ۱۲٫۴ مگابایت)".
// Premium files carry their price tag: "💰 ۵۰٬۰۰۰ تومان".
export function fileLine(file) {
  const parts =
    (file.parts_count || 1) > 1 ? `، ${file.parts_count} پارت` : '';
  const size = file.size_total ? `، ${formatBytes(file.size_total)}` : '';
  const ver = file.version ? ` v${file.version}` : '';
  const price =
    (Number(file.price) || 0) > 0 ? `، 💰 ${formatToman(file.price)}` : '';
  return `${file.id} — ${truncate(file.title || '(بدون عنوان)', 45)}${ver}${parts}${size}${price}`;
}

// Full file view text. Shows the title (the owner's label) AND the
// original Telegram file name, verbatim — the bot never renames a file.
export function formatFile(file, parts, versions, downloadCount) {
  const lines = [];
  lines.push(`${file.id} — ${file.title || '(بدون عنوان)'}`);
  lines.push('');
  if (file.description) lines.push(file.description, '');
  const names = (parts || []).map((p) => p.file_name).filter(Boolean);
  if (names.length === 1) lines.push(`نام فایل: ${names[0]}`);
  if (names.length > 1) {
    lines.push('نام فایل‌ها:');
    for (const [i, n] of names.entries()) lines.push(`  ${i + 1}. ${n}`);
  }
  lines.push(`دسته: ${file.category || 'سایر'}`);
  lines.push(
    (Number(file.price) || 0) > 0
      ? `قیمت: ${formatToman(file.price)} (پرمیوم)`
      : 'قیمت: رایگان',
  );
  lines.push(`نسخه: v${file.version || 1} (از ${versions.length} نسخه)`);
  lines.push(`نوع: ${KIND_FA[file.kind] || file.kind || '—'}`);
  if (file.size_total) lines.push(`حجم: ${formatBytes(file.size_total)}`);
  lines.push(`پارت‌ها: ${parts.length}`);
  lines.push(`دانلودها: ${downloadCount}`);
  if (file.created_at) lines.push(`افزوده شده: ${formatTehran(file.created_at)}`);
  return truncate(lines.join('\n'), 4000);
}

// Seconds as "1:23" / "1:02:03".
export function formatDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
