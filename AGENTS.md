# AGENTS.md — ErffanHub v2 (bot-only, v2.2.0)

## Layout

- `tgcloud/` — Telegram Serverless bot: SQLite database, handlers, shared
  code. No `endpoints/` and no Mini App since v2.1.0.
- `worker/` — one Cloudflare Worker: RSS fetch, AI post writing, AI
  classification, publishing to the channel, 15-minute Cron for scheduled
  posts, KV queue for scheduled posts only.

## The two pieces

- The bot (Telegram Serverless) owns the inbox, drafts, feeds and scheduling state.
- The Worker is the only publishing path. The bot asks the Worker to publish; nothing else publishes.
- The bot and the Worker share one secret (`SHARED_SECRET`). It must be identical on both sides. It never appears in browser JS.

## Rules

- Bot-only: there is no dashboard, no Mini App, no `endpoints/`, no
  `APP_URL`. `tgcloud.jsonc` keeps `"static": false` so the next push
  removes the previously deployed site.
- Owner-only: only `OWNER_TELEGRAM_ID` may use the bot. The server enforces this.
- One screen, edited in place: navigation edits the same message
  (`api.editMessageText`); commands send a single screen message; the bot
  never sends a batch of messages. One `fetchNews`, one inbox lister, one
  draft renderer, all in `tgcloud/lib/` and shared by both handlers — no
  duplicated logic between `message.js` and `callback_query.js`.
- Review queue (v7): the inbox is grouped by AI topic category AND by RSS
  feed. One news item at a time, exactly 3 buttons — ✅ تایید | ◀ قبلی |
  بعدی ▶. No wrap-around: at the ends the button answers a short toast
  and the message does not change. Confirming writes the post with AI,
  hard-deletes the news row, and the same message becomes the draft view
  with a «برگشت به بررسی» button that resumes the group at the next item.
  There is no discard button; unconfirmed news stays 3 days, then is
  pruned on fetch. Published drafts older than 30 days are pruned on fetch.
- Categories (v7): the fixed list in `tgcloud/lib/categories.js` and
  `worker/src/lib/categories.js` MUST stay identical — the two sides
  deploy separately and cannot share the file. The Worker classifies a
  freshly fetched batch with one AI call (`POST /ai/classify`, max 30
  items); any failure or unknown category is «سایر», never a fetch failure.
  News fetched before v7 has a null category and reads as «سایر».
- YouTube has its own menu section («یوتیوب (n)») with its own list;
  the general drafts list labels every row [خبر] / [یوتیوب]. A YouTube
  draft view shows a «تماشا در یوتیوب» URL button; the thumbnail is the
  photo of the published channel post (Telegram text messages cannot
  embed it, and the link preview of the video URL shows it in the draft).
- Adding a feed from inside the bot (v7): the «➕ افزودن فید» button in
  the feeds view asks for the URL, then an optional name («بدون نام» or
  «-» skips it). Validation is `https` only, valid URL, not already
  added — the same `validateFeedUrl` helper as `/addrss`.
- Real errors, never generic ones: every Worker failure is shown with its
  real reason (see `tgcloud/lib/errors.js`). `/diag` checks Worker, secret,
  AI, KV and channel and reports one line per check.
- No free-form AI chat. AI only writes/edits a channel post from a news item or a YouTube link, and classifies fetched news.
- Persian RTL UI. Clean code, no emoji/banner decoration in code, no TODOs, no dead code.
- Schema is minimal: 4 tables (settings, rss_feeds, news_items,
  drafts) + the `category` column on news_items (v7). `publish_log` was
  dropped in v2.1.0 — nothing read it (it only fed the deleted
  dashboard's history tab). Do not change `tgcloud/schema.js` without a
  migration plan — the live database already has these tables.

## Deploy

1. Worker first: `cd worker`, set `BOT_TOKEN` and `SHARED_SECRET` with `wrangler secret put`, then `wrangler deploy`.
2. Fill `OWNER_TELEGRAM_ID`, `WORKER_URL` and `SHARED_SECRET` in `tgcloud/lib/config.js`.
3. `npx tgcloud push` then `npx tgcloud migrate` — from the live v5
   database the migration makes 2 changes: DROP TABLE publish_log +
   ADD COLUMN category TEXT to news_items.

## Test

```sh
npm test      # node --test "test/*.test.js" "worker/test/*.test.js"
npm run check # node --check on every source file (bot + Worker)
```
