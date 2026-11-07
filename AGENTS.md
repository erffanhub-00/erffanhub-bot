# AGENTS.md — ErffanHub v2

## Layout

- `tgcloud/` — Telegram Serverless bot: SQLite database, handlers, bot endpoints, shared-secret client to the Worker.
- `worker/` — one Cloudflare Worker: RSS fetch, AI post writing, publishing to the channel, 15-minute Cron for scheduled posts, KV queue for scheduled posts only.
- `miniapp/` — the dashboard Mini App (plain HTML/CSS/JS, no framework). `node miniapp/build.js` copies files into `miniapp/dist/`, which `tgcloud.jsonc` serves.

## The two pieces

- The bot (Telegram Serverless) owns the inbox, drafts, feeds and scheduling state.
- The Worker is the only publishing path. The bot and the Mini App ask the Worker to publish; nothing else publishes.
- The bot and the Worker share one secret (`SHARED_SECRET`). It must be identical on both sides. It never appears in browser JS.

## Rules

- Owner-only: only `OWNER_TELEGRAM_ID` may use the bot or the dashboard. The server enforces this.
- No free-form AI chat. AI only writes/edits a channel post from a news item or a YouTube link.
- Persian RTL UI. Clean code, no emoji/banner decoration in code, no TODOs, no dead code.

## Deploy

1. Worker first: `cd worker`, set `BOT_TOKEN` and `SHARED_SECRET` with `wrangler secret put`, then `wrangler deploy`.
2. Fill `OWNER_TELEGRAM_ID`, `WORKER_URL` and `SHARED_SECRET` in `tgcloud/lib/config.js`.
3. `npx tgcloud push` then `npx tgcloud migrate`.

## Test

```sh
npm test      # node --test "test/*.test.js" "worker/test/*.test.js"
npm run check # node --check on every source file
npm run build:miniapp
```
