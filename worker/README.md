# ErffanHub Worker (`erffanhub-ai`)

One Cloudflare Worker: the backend for the ErffanHub Telegram channel
manager. Plain JavaScript, no dependencies.

## What it does

- `POST /news/fetch` — fetch RSS 2.0 / Atom feeds, return new items.
- `POST /health` — same shared-secret auth; returns `{ ok: true, ai, kv }`
  for the bot's /diag command.
- `POST /ai` — write, rewrite, shorten or formalize a Persian channel post
  with Workers AI (Llama 3.1 8B), using only the facts in the given source.
- `GET /link/preview?url=` — YouTube preview (title, author, thumbnail)
  via oEmbed.
- `POST /publish` — publish a draft to the Telegram channel now.
- `POST /schedule` / `POST /schedule/cancel` — queue / cancel a scheduled
  post in KV.
- Cron every 15 minutes — publish due scheduled posts from KV.

The Worker is the only publishing path. The bot asks
the Worker to publish; nothing else publishes.

## Auth

Every route requires two headers:

- `X-Erffan-Secret: <SHARED_SECRET>` — must equal the `SHARED_SECRET`
  secret on the Worker.
- `X-Timestamp: <unix seconds>` — must be within ±5 minutes of now.

Otherwise the Worker answers `401 {"ok":false,"error":"unauthorized"}`.
The Cron trigger is exempt from auth.

## Secrets to set

```sh
cd worker
wrangler secret put BOT_TOKEN
wrangler secret put SHARED_SECRET
```

- `BOT_TOKEN` — the Telegram bot token.
- `SHARED_SECRET` — one shared secret, identical on the Worker and on the
  bot side (`tgcloud/lib/config.js`). It never appears in browser JS.

`OWNER_TELEGRAM_ID` is a plain variable, not a secret: set it in the
Cloudflare dashboard (or `wrangler.toml` `[vars]`) to the owner's Telegram
user id, so the Cron can notify the owner about failed or uncertain
scheduled posts.

## KV

Create the scheduled-posts namespace and fill in its id in
`wrangler.toml` (it currently holds `PLACEHOLDER_KV_ID`):

```sh
wrangler kv namespace create SCHEDULED_KV
```

Then replace `PLACEHOLDER_KV_ID` in `wrangler.toml` with the returned id.

## Deploy

```sh
cd worker
wrangler secret put BOT_TOKEN
wrangler secret put SHARED_SECRET
wrangler deploy
```

## Scheduled posts

A scheduled post is stored in KV as `scheduled:<draft_id>` with
`{draft, channel_id, publish_at}` (`publish_at` is epoch ms, UTC).
Every 15 minutes the Cron publishes whatever is due
(`publish_at <= Date.now()`), then deletes the key.

- Telegram confirms success: key deleted.
- Telegram clearly rejects (`ok:false`): key deleted, the post is stored
  under `failed:<draft_id>` with the error, and the owner is notified.
- Outcome uncertain (network error, unparsable response): the key is
  moved to `needs_review:<draft_id>` and the owner is notified in
  Persian to check the channel. It is **never auto-retried**, because
  the post may already have been published.

## YouTube note

`GET /link/preview` uses the YouTube oEmbed endpoint. oEmbed returns
**NO description** — only title, author name and thumbnail. The
description of a YouTube draft therefore always starts empty, for the
owner to fill in.

## Tests

```sh
npm test    # node --test "test/*.test.js" (the glob form: passing the
            # test/ directory itself fails on this sandbox's Node build,
            # which tries to load the directory as a module)
npm run check
```

Tests use saved feed samples in `test/fixtures/` (fetched once from the
live Zoomit, Digiato and TechCrunch feeds) plus inline Atom and oEmbed
samples, so they run offline.
