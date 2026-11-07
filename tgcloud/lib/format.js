// Pure formatting helpers shared by both handlers. No 'sdk' import.

export const DRAFT_STATUS_FA = {
  draft: 'پیش‌نویس',
  scheduled: 'زمان‌بندی‌شده',
  published: 'منتشرشده',
  discarded: 'حذف‌شده',
};

export function truncate(text, max) {
  const s = String(text ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Tehran wall time, Persian locale.
export function formatTehran(ms) {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

// Full draft text for a screen view (capped at Telegram's 4096 chars).
export function formatDraft(draft) {
  const lines = [];
  if (draft.title) lines.push(draft.title);
  if (draft.body) lines.push('', draft.body);
  if (draft.source_url) {
    lines.push('', (draft.kind === 'youtube' ? 'ویدیو: ' : 'منبع: ') + draft.source_url);
  }
  if (draft.status === 'scheduled' && draft.publish_at) {
    lines.push('', 'زمان انتشار: ' + formatTehran(draft.publish_at));
  }
  const text = lines.join('\n').trim() || '(پیش‌نویس خالی)';
  return truncate(text, 4000);
}

// Draft shape the Worker expects for /publish and /schedule.
export function draftPayload(draft) {
  return {
    id: draft.id,
    title: draft.title,
    body: draft.body,
    media_url: draft.media_url || undefined,
    source_url: draft.source_url || undefined,
    button_text: draft.button_text || undefined,
    button_url: draft.button_url || undefined,
  };
}

// RSS/Atom published_at comes as seconds, ms or an ISO string.
export function parsePublishedAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1000000000000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

// Public link to a channel message (only for public channels, id -100...).
export function channelMessageLink(channelId, messageId) {
  const s = String(channelId);
  if (s.startsWith('-100')) return `https://t.me/c/${s.slice(4)}/${messageId}`;
  return null;
}
