import { APP_URL } from './config.js';

// Persian inline keyboards. Only the emojis from the plan appear in
// user-facing labels (edit, delete, confirm); nothing else is decorated.

export function mainMenu() {
  return {
    inline_keyboard: [
      [
        { text: 'گرفتن خبرها', callback_data: 'menu:fetch_news' },
        { text: 'پیش‌نویس‌ها', callback_data: 'menu:drafts' },
      ],
      [{ text: 'باز کردن داشبورد', web_app: { url: APP_URL } }],
    ],
  };
}

export function newsItemButtons(newsId) {
  return {
    inline_keyboard: [
      [
        { text: 'نوشتن پست', callback_data: `news_make:${newsId}` },
        { text: 'رد کردن', callback_data: `news_discard:${newsId}` },
      ],
    ],
  };
}

export function draftButtons(draftId) {
  return {
    inline_keyboard: [
      [
        { text: 'انتشار الان', callback_data: `draft_publish:${draftId}` },
        { text: '✏️ ویرایش', callback_data: `draft_edit:${draftId}` },
      ],
      [
        { text: 'بازنویسی', callback_data: `draft_rewrite:${draftId}` },
        { text: 'کوتاه‌تر', callback_data: `draft_shorter:${draftId}` },
      ],
      [
        { text: 'زمان‌بندی', callback_data: `draft_schedule:${draftId}` },
        { text: '🗑️ حذف', callback_data: `draft_discard:${draftId}` },
      ],
    ],
  };
}

export function confirmPublishButtons(draftId) {
  return {
    inline_keyboard: [
      [
        {
          text: '✅ تایید و انتشار',
          callback_data: `draft_publish_confirm:${draftId}`,
        },
        { text: 'لغو', callback_data: `draft_publish_cancel:${draftId}` },
      ],
    ],
  };
}
