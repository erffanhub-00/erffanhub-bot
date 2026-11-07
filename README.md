# ErffanHub v2

A dashboard + a bot for running a Telegram channel. Fetch news from RSS feeds, turn a news item (or a YouTube link) into a post with AI help, edit it, schedule it, and publish it to the channel — all from the bot or from the Mini App dashboard.

## What it does

1. **RSS inbox** — fetches news from the feeds you choose.
2. **Dashboard** — pick a news item, write the post, edit it.
3. **YouTube** — send a video link, get its thumbnail + title, edit the description, publish as a photo + caption with a glass "watch on YouTube" button.
4. **Scheduling** — set a publish time (Tehran time) for a draft; it publishes on its own.
5. **Publishing** — now, or on schedule, into the channel.

AI only writes/edits the channel post. There is no free-form AI chat.

## Architecture

Two pieces, one publishing path:

```
Telegram Serverless                    Cloudflare Worker (erffanhub-ai)
  bot + SQLite + Mini App dashboard      RSS fetch, AI writing, publishing
    ├─ news inbox, drafts                 15-min Cron (scheduled posts only)
    ├─ editing and management             KV: scheduled-post queue only
    └─ scheduling (date + time)           publishing happens ONLY here
```

The bot and the dashboard never publish directly. They ask the Worker to publish, so there is a single Publisher path. The bot and the Worker share one secret (`SHARED_SECRET`); it never appears in browser JS, and the Mini App never talks to Cloudflare directly — it calls the bot's endpoints only through `Telegram.WebApp.Serverless.call`.

## Setup — do these in order

### 1. Create the bot and connect Serverless

1. In Telegram, talk to [@BotFather](https://t.me/BotFather) and open your bot.
2. Open **Serverless** and turn it on (this unlocks the CLI access token).
3. Copy the CLI access token and log in:

```sh
npx tgcloud login
```

### 2. Deploy the Worker first

```sh
cd worker
wrangler secret put BOT_TOKEN
wrangler secret put SHARED_SECRET
wrangler deploy
```

Note the `workers.dev` URL printed by the deploy — that is `WORKER_URL`.

### 3. Fill in the config

In `tgcloud/lib/config.js`, set:

- `OWNER_TELEGRAM_ID` — your Telegram user ID (ask [@userinfobot](https://t.me/userinfobot)).
- `WORKER_URL` — the Worker URL from step 2.
- `SHARED_SECRET` — must be exactly the same value as the Cloudflare secret from step 2.

### 4. Add the bot to the channel

Add the bot as an admin of your channel (it needs permission to post messages).

### 5. Deploy the bot

```sh
npx tgcloud push
npx tgcloud migrate
```

### 6. Open the bot

Open the bot in Telegram and send `/start`.

## RSS feeds (default)

| Source | URL |
|---|---|
| Zoomit | https://www.zoomit.ir/feed/ |
| Digiato | https://digiato.com/feed |
| TechCrunch | https://techcrunch.com/feed/ |

Verified live 2026-11-07. Feeds can be added, toggled and removed from the dashboard.

## Bot commands

| Command | What it does |
|---|---|
| `/start` | Start the bot |
| `/news` | Fetch fresh news into the inbox |
| `/drafts` | List drafts |
| `/dashboard` | Open the Mini App dashboard |
| `/help` | Show help |
| `/addrss <url> [name]` | Add an RSS feed |

## Mini App dashboard

Three tabs: اخبار (news inbox + feed management), پیش‌نویس‌ها (drafts: edit, publish now), زمان‌بندی (scheduled posts, change/cancel time, publish history). Plain HTML/CSS/JS, no framework, no build tool:

```sh
node miniapp/build.js
```

This copies the Mini App files into `miniapp/dist/`, which `tgcloud push` deploys from local disk (`miniapp/dist` is intentionally tracked in git — see `.gitignore`).

## Costs

All free, no bank card needed.

| Piece | Cost |
|---|---|
| Telegram Serverless | Free start reported |
| Cloudflare Workers (Free) | 0 — Cron every 15 min = 96 requests/day |
| Cloudflare Workers AI (Free) | 0 — 10,000 neurons/day; one post ≈ 20 neurons |
| Cloudflare KV (Free) | 0 — scheduled queue only |

## Security notes

- **Owner-only.** Only `OWNER_TELEGRAM_ID` can use the bot or the dashboard; the server enforces this.
- **Secret never in browser JS.** The Mini App holds no secret and never calls Cloudflare directly.
- **HTTPS-only RSS**, with a timeout and a size cap.
- **No auto-retry on uncertain publish.** If Telegram does not answer but the post may have gone out, the post is flagged for review instead of being published twice.
- **YouTube:** oEmbed returns the thumbnail and title, but no description — the description is edited in the draft.

## Test

```sh
npm test             # node --test "test/*.test.js" "worker/test/*.test.js"
npm run check        # node --check on every source file
npm run build:miniapp
```

## Me
[![Telegram](https://img.shields.io/badge/Telegram-erffan__hub-blue?style=for-the-badge&logo=telegram)](https://t.me/erffan_hub)
[![Twitter](https://img.shields.io/badge/Twitter-@Erffanhub__00-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Erffanhub_00)
[![Gist](https://img.shields.io/badge/Gist-Profile-000000?style=for-the-badge&logo=github)](https://gist.github.com/erffanhub-00)
[![Github](https://img.shields.io/badge/Github-Profile-000000?style=for-the-badge&logo=github)](https://github.com/erffanhub-00)
