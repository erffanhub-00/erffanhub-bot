# ErffanHub v2

A bot-only Telegram channel content manager. Fetch news from RSS feeds, review it one by one (grouped by AI topic category or by RSS feed), turn a news item (or a YouTube link) into a post with AI help, edit it, schedule it, and publish it to the channel — everything happens inside the bot. There is no dashboard.

## What it does

1. **RSS inbox** — fetches news from the feeds you choose. AI sorts every item into a topic category (موبایل، هوش مصنوعی، کامپیوتر و سخت‌افزار، نرم‌افزار و اپ، بازی، امنیت، اینترنت و شبکه، گجت و پوشیدنی، سایر).
2. **Review queue** — pick a category or a feed, then read the news one by one: تایید to make a post, قبلی / بعدی to move through the group. Unconfirmed news stays 3 days, then is deleted.
3. **YouTube** — send a video link, get its thumbnail + title, edit the description, publish as a photo + caption with a glass "watch on YouTube" button. YouTube drafts have their own section in the menu, separate from news.
4. **Scheduling** — set a publish time (Tehran time) for a draft; it publishes on its own.
5. **Publishing** — now, or on schedule, into the channel.

AI only writes/edits the channel post. It does not write the news itself — news comes from RSS exactly as the source wrote it. There is no free-form AI chat.

## How the bot works

One screen at a time. `/start` shows the main menu (news, drafts, scheduled, feeds, YouTube, help). Every button edits that same message — nothing new is sent. The inbox shows groups first (categories, then feeds, each with its count, plus "all news"); tapping a group opens the review: one news item, exactly 3 buttons (✅ تایید | ◀ قبلی | بعدی ▶). Confirming writes the post with AI, deletes the news item, and turns the same message into the draft view (publish / edit / rewrite / shorter / schedule / delete), with a «برگشت به بررسی» button that resumes the group at the next item. Drafts, scheduled posts, feeds and YouTube videos work the same way. News you do not confirm stays 3 days and is then pruned automatically; `/clear` deletes all new news in one go. Published drafts older than 30 days are pruned on fetch.

## Architecture

Two pieces, one publishing path:

```
Telegram Serverless                    Cloudflare Worker (erffanhub-ai)
  bot + SQLite                           RSS fetch, AI writing, AI
    ├─ news review queue                  classification, publishing
    ├─ drafts, YouTube, scheduling        15-min Cron (scheduled posts only)
    └─ feeds                              KV: scheduled-post queue only
                                           publishing happens ONLY here
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

The migration (from the live v5 database) makes 2 changes — confirm both when `migrate` asks:

1. **DROP TABLE publish_log** (the unused table from v5).
2. **ADD COLUMN category TEXT to news_items** (the AI topic category; old rows stay empty and read as «سایر»).

### 6. Open the bot

Open the bot in Telegram and send `/start`, then `/diag` — every check should be ✓.

## RSS feeds (default)

| Source | URL |
|---|---|
| Zoomit | https://www.zoomit.ir/feed/ |
| Digiato | https://digiato.com/feed |
| TechCrunch | https://techcrunch.com/feed/ |

Verified live 2026-11-07. Feeds can be added, toggled and removed with `/feeds` (the «➕ افزودن فید» button asks for the URL, then an optional name) and `/addrss`.

## Bot commands

| Command | What it does |
|---|---|
| `/start` | Main menu |
| `/news` | Fetch fresh news and open the inbox (categories + feeds) |
| `/drafts` | List drafts (news and YouTube, labelled) |
| `/scheduled` | List scheduled posts |
| `/feeds` | Manage RSS feeds, add a feed from inside the bot |
| `/diag` | Check Worker, secret, AI, KV and channel |
| `/clear` | Delete all new news |
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
| Cloudflare Workers AI (Free) | 0 — 10,000 neurons/day; one post ≈ 20 neurons, one classify batch ≈ a few neurons |
| Cloudflare KV (Free) | 0 — scheduled queue only |

## Security notes

- **Owner-only.** Only `OWNER_TELEGRAM_ID` can use the bot; the server enforces this.
- **HTTPS-only RSS**, with a timeout and a size cap.
- **No auto-retry on uncertain publish.** If Telegram does not answer but the post may have gone out, the post is flagged for review instead of being published twice.
- **YouTube:** oEmbed returns the thumbnail and title, but no description — the description is edited in the draft.

## Test

```sh
npm test             # node --test "test/*.test.js" "worker/test/*.test.js"
npm run check        # node --check on every source file (bot + Worker)
```

## Me
[![Telegram](https://img.shields.io/badge/Telegram-erffan__hub-blue?style=for-the-badge&logo=telegram)](https://t.me/erffan_hub)
[![Twitter](https://img.shields.io/badge/Twitter-@Erffanhub__00-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Erffanhub_00)
[![Gist](https://img.shields.io/badge/Gist-Profile-000000?style=for-the-badge&logo=github)](https://gist.github.com/erffanhub-00)
[![Github](https://img.shields.io/badge/Github-Profile-000000?style=for-the-badge&logo=github)](https://github.com/erffanhub-00)
