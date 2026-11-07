# AGENTS.md — ErffanHub v2 (bot-only, v2.1.0)

## Layout

- `tgcloud/` — Telegram Serverless bot: SQLite database, handlers, shared
  code. No `endpoints/` and no Mini App since v2.1.0.
- `worker/` — one Cloudflare Worker: RSS fetch, AI post writing,
  publishing to the channel, 15-minute Cron for scheduled posts, KV queue
  for scheduled posts only.

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
- Real errors, never generic ones: every Worker failure is shown with its
  real reason (see `tgcloud/lib/errors.js`). `/diag` checks Worker, secret,
  AI, KV and channel and reports one line per check.
- No free-form AI chat. AI only writes/edits a channel post from a news item or a YouTube link.
- Persian RTL UI. Clean code, no emoji/banner decoration in code, no TODOs, no dead code.
- Schema is minimal: 4 tables (settings, rss_feeds, news_items,
  drafts). `publish_log` was dropped in v2.1.0 — nothing read it (it only
  fed the deleted dashboard's history tab). Do not change
  `tgcloud/schema.js` without a migration plan — the live database already
  has these tables.

## Deploy

1. Worker first: `cd worker`, set `BOT_TOKEN` and `SHARED_SECRET` with `wrangler secret put`, then `wrangler deploy`.
2. Fill `OWNER_TELEGRAM_ID`, `WORKER_URL` and `SHARED_SECRET` in `tgcloud/lib/config.js`.
3. `npx tgcloud push` then `npx tgcloud migrate` — the migration drops the
   unused `publish_log` table (1 change).

## Test

```sh
npm test      # node --test "test/*.test.js" "worker/test/*.test.js"
npm run check # node --check on every source file
```
