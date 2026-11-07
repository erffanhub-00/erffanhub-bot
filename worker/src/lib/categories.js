// News topic categories. The Worker assigns one of these to every news
// item with a single batched AI call when the news is fetched; the bot
// groups the review queue by them. This list MUST stay identical to
// tgcloud/lib/categories.js — the two sides deploy separately and
// cannot share the file.

export const CATEGORIES = [
  'موبایل',
  'هوش مصنوعی',
  'کامپیوتر و سخت‌افزار',
  'نرم‌افزار و اپ',
  'بازی',
  'امنیت',
  'اینترنت و شبکه',
  'گجت و پوشیدنی',
  'سایر',
];

export const OTHER_CATEGORY = 'سایر';

// Anything unknown or empty becomes 'سایر'.
export function normalizeCategory(value) {
  const v = String(value ?? '').trim();
  return CATEGORIES.includes(v) ? v : OTHER_CATEGORY;
}

// Parse the AI reply to a classify call: one line per item, in the form
// "1. هوش مصنوعی". Lines that do not match, or name an unknown category,
// fall back to 'سایر' for that item — classification never fails the
// fetch. `items` are the items sent, in the same order.
export function parseClassifyText(text, items) {
  const byNumber = new Map();
  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^(\d+)\s*[.)\-:]\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const category = normalizeCategory(m[2].replace(/[.,;،]+$/, '').trim());
    byNumber.set(Number(m[1]), category);
  }
  return items.map((item, i) => ({
    id: item.id,
    category: byNumber.get(i + 1) ?? OTHER_CATEGORY,
  }));
}
