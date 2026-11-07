# erffanhub-cleanup — the timer for the file-library bot

Telegram Serverless has no timer or cron, so the bot deletes
self-deleting messages (files after 60s, notices after 20s) lazily —
on the next use of the bot. This tiny Cloudflare Worker adds a real
timer: once a minute it calls the bot's `cleanup` endpoint with the
owner's signed Telegram init data, exactly the way the Mini App SDK
does (`Authorization: TMA <base64(initData)>`). The platform verifies
the signature before the endpoint runs.

If the platform ever refuses the signed call (401), nothing breaks:
the bot's lazy sweep still cleans up on the next use. The cron only
makes deletion punctual.

## Deploy

```sh
cd cleanup-worker
npx wrangler login
npx wrangler secret put BOT_TOKEN   # the bot API token from BotFather (NOT the tgcloud CLI token)
```

Set `OWNER_ID` in `wrangler.toml` to your Telegram user id (the same
number as `OWNER_TELEGRAM_ID` in `tgcloud/lib/config.js`), then:

```sh
npx wrangler deploy
```

Workers Free covers this (one request a minute, no card needed).

## Verify

Open the Worker URL that `wrangler deploy` prints — it runs one
sweep immediately and returns the result as JSON
(`{"status":200,"body":{"deleted":0,...}}`). Or watch the live logs:

```sh
npx wrangler tail
```

Then test for real: download a file in the bot, wait 2 minutes
**without touching the bot** — if the file is gone, the timer works.
If it is still there, check `wrangler tail` for a 401: the platform
refused the signed call and the lazy cleanup is doing the job
instead (the file disappears on the next use of the bot).
