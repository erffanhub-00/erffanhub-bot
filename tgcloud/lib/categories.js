// News topic categories. The Worker assigns one of these to every news
// item with a single batched AI call when the news is fetched; the bot
// groups the review queue by them. This list MUST stay identical to
// worker/src/lib/categories.js — the two sides deploy separately and
// cannot share the file. No 'sdk' import, so it is testable under Node.

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

// Anything unknown, empty or from before v7 (null) becomes 'سایر'.
export function normalizeCategory(value) {
  const v = String(value ?? '').trim();
  return CATEGORIES.includes(v) ? v : OTHER_CATEGORY;
}

// The display category of a news row (null = fetched before v7).
export function categoryOf(item) {
  return normalizeCategory(item?.category);
}
