// Fill these in before the first deploy. No real secrets live here.

// Numeric Telegram user id of the bot owner (Erfan). Get it from
// @userinfobot. While it is 0, isOwner() refuses everyone.
export const OWNER_TELEGRAM_ID = 0;

// Base URL of the Cloudflare Worker (erffanhub-ai), after deploying it.
// Example: "https://erffanhub-ai.erfan.workers.dev"
export const WORKER_URL = 'https://erffanhub-ai.<subdomain>.workers.dev';

// Shared secret sent as the X-Erffan-Secret header on every Worker call.
// Must equal the secret configured on the Cloudflare Worker.
// Never put a real secret in this file in a shared copy; Erfan sets it
// in his own checkout before deploying.
export const SHARED_SECRET = 'CHANGE_ME';

// Default RSS feeds, seeded into rss_feeds on first run if that table is
// empty. Verified live 2026-11-07. Editable later with /feeds and /addrss.
export const DEFAULT_FEEDS = [
  { name: 'Zoomit', url: 'https://www.zoomit.ir/feed/' },
  { name: 'Digiato', url: 'https://digiato.com/feed' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
];
