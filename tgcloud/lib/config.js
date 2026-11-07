// Fill these in before the first deploy. No real secrets live here.
// IDs are numbers (negative for channels/groups); get them with /id
// after the bot is running, or from @userinfobot / @getmyid_bot.

// Numeric Telegram user id of the bot owner (Erfan). While it is 0,
// isOwner() refuses everyone.
export const OWNER_TELEGRAM_ID = 0;

// Channel and public group the bot is connected to (force-join).
// 0 means "not configured yet" — that check is skipped until set.
export const CHANNEL_ID = 0;
export const GROUP_ID = 0;

// Private database group (only the owner + the bot). Files sent here
// become library files. 0 means "not configured yet".
export const DB_GROUP_ID = 0;

// Public join links shown on the force-join screen.
export const CHANNEL_URL = '';
export const GROUP_URL = '';

// GitHub username whose public repos are shown on /projects.
export const GITHUB_USER = 'erffanhub-00';

// Social links shown on /socials. Edit freely.
export const SOCIALS = [
  { label: 'تلگرام', url: 'https://t.me/erffan_hub' },
  { label: 'ایکس', url: 'https://x.com/Erffanhub_00' },
  { label: 'گیت‌هاب', url: 'https://github.com/erffanhub-00' },
];
