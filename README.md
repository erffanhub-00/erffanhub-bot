# ErffanHub v2

A bot-only Telegram channel content manager. Fetch news from RSS feeds, turn a news item (or a YouTube link) into a post with AI help, edit it, schedule it, and publish it to the channel — everything happens inside the bot. There is no dashboard.

## What it does

1. **RSS inbox** — fetches news from the feeds you choose.
2. **Bot screens** — pick a news item, write the post, edit it. One screen, edited in place; the bot never spams messages.
3. **YouTube** — send a video link, get its thumbnail + title, edit the description, publish as a photo + caption with a glass "watch on YouTube" button.
4. **Scheduling** — set a publish time (Tehran time) for a draft; it publishes on its own.
5. **Publishing** — now, or on schedule, into the channel.

AI only writes/edits the channel post. There is no free-form AI chat.

## How the bot works

One screen at a time. `/start` shows the main menu (news, drafts, scheduled, feeds, help). Every button edits that same message — nothing new is sent. The inbox shows 5 news items per page; tapping one opens it (write post, discard, delete, back). Drafts, scheduled posts and feeds work the same way. Old news (7 days) is pruned automatically, and `/clear` deletes all new and discarded news in one go.

## Architecture

Two pieces, one publishing path:

```
Telegram Serverless                    Cloudflare Worker (erffanhub-ai)
  bot + SQLite                           RSS fetch, AI writing, publishing
    ├─ news inbox, drafts                 15-min Cron (scheduled posts only)
    ├─ editing and management             KV: scheduled-post queue only
    └─ scheduling (date + time)           publishing happens ONLY here
```

The bot never publishes directly. It asks the Worker to publish, so there is a single Publisher path. The bot and the Worker share one secret (`SHARED_SECRET`); it never appears in browser JS.

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
wrangler kv namespace create SCHEDULED_KV
```

Put the returned id in `worker/wrangler.toml` (replacing `PLACEHOLDER_KV_ID`) and add your owner id:

```toml
[vars]
OWNER_TELEGRAM_ID = "123456789"
```

Then:

```sh
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
npm install
npx tgcloud push
npx tgcloud migrate
```

The migration drops the unused `publish_log` table (1 change — confirm the drop when `migrate` asks).

### 6. Open the bot

Open the bot in Telegram and send `/start`.

## RSS feeds (default)

| Source | URL |
|---|---|
| Zoomit | https://www.zoomit.ir/feed/ |
| Digiato | https://digiato.com/feed |
| TechCrunch | https://techcrunch.com/feed/ |

Verified live 2026-11-07. Feeds can be added, toggled and removed with `/feeds` and `/addrss`.

## Bot commands

| Command | What it does |
|---|---|
| `/start` | Main menu |
| `/news` | Fetch fresh news and open the inbox |
| `/drafts` | List drafts |
| `/scheduled` | List scheduled posts |
| `/feeds` | Manage RSS feeds |
| `/diag` | Check Worker, secret, AI, KV and channel |
| `/clear` | Delete all new and discarded news |
| `/addrss <url> [name]` | Add an RSS feed |
| `/help` | Show help |

## Troubleshooting

Run `/diag` first — it checks each piece and tells you the real reason when one fails.

| /diag says | Cause | Fix |
|---|---|---|
| Worker در دسترس نیست | `WORKER_URL` wrong, or the Worker is not deployed | Check `WORKER_URL` in `tgcloud/lib/config.js`; run `wrangler deploy` in `worker/` |
| سکرت مشترک درست نیست | `SHARED_SECRET` in `config.js` differs from the Cloudflare secret | Make both identical, then `npx tgcloud push` again |
| AI کار نمی‌کند | Workers AI error | Look at the Worker logs in the Cloudflare dashboard |
| KV تنظیم نشده | `SCHEDULED_KV` has no id in `wrangler.toml` | `wrangler kv namespace create SCHEDULED_KV`, put the id in `wrangler.toml`, `wrangler deploy` |
| کانال تنظیم نشده | The bot is not a channel admin | Add the bot as admin to the channel |

If a Worker call fails anywhere else in the bot, the message shows the real reason too — never a bare "خطایی رخ داد".

## Costs

All free, no bank card needed.

| Piece | Cost |
|---|---|
| Telegram Serverless | Free start reported |
| Cloudflare Workers (Free) | 0 — Cron every 15 min = 96 requests/day |
| Cloudflare Workers AI (Free) | 0 — 10,000 neurons/day; one post ≈ 20 neurons |
| Cloudflare KV (Free) | 0 — scheduled queue only |

## Security notes

- **Owner-only.** Only `OWNER_TELEGRAM_ID` can use the bot; the server enforces this.
- **HTTPS-only RSS**, with a timeout and a size cap.
- **No auto-retry on uncertain publish.** If Telegram does not answer but the post may have gone out, the post is flagged for review instead of being published twice.
- **YouTube:** oEmbed returns the thumbnail and title, but no description — the description is edited in the draft.

## Test

```sh
npm test             # node --test "test/*.test.js" "worker/test/*.test.js"
npm run check        # node --check on every source file
```

## Me
[![Telegram](https://img.shields.io/badge/Telegram-erffan__hub-blue?style=for-the-badge&logo=telegram)](https://t.me/erffan_hub)
[![Twitter](https://img.shields.io/badge/Twitter-@Erffanhub__00-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Erffanhub_00)
[![Gist](https://img.shields.io/badge/Gist-Profile-000000?style=for-the-badge&logo=github)](https://gist.github.com/erffanhub-00)
[![Github](https://img.shields.io/badge/Github-Profile-000000?style=for-the-badge&logo=github)](https://github.com/erffanhub-00)
