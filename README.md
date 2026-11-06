# ErffanHub Toolbox

A personal Telegram bot that organizes tools into categories and opens them in the browser, plus inline search over files saved to a private group.

Built with Cloudflare Workers, the Telegram Bot API, and Cloudflare D1.

Live bot: https://t.me/erffanhubbot

[![CI](https://github.com/erffanhub-00/erffanhub-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/erffanhub-00/erffanhub-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Telegram](https://img.shields.io/badge/Telegram-erffan__hub-blue?style=for-the-badge&logo=telegram)](https://t.me/erffan_hub)
[![X](https://img.shields.io/badge/X-@Erffanhub__00-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Erffanhub_00)
[![GitHub](https://img.shields.io/badge/GitHub-erffanhub--00-000000?style=for-the-badge&logo=github)](https://github.com/erffanhub-00)

## Features

- **Toolbox menu** — tools grouped into categories, opened with one tap.
- **Inline file search** — type `@erffanhubbot <name>` in any chat to find files
  saved to the storage group. Add `| pdf` to filter by file type.
- **File index** — files sent to a private group are stored in D1 with
  full-text search (FTS5). A `#hashtag` in the caption sets the category.
- **Private by design** — only the owner can use the bot or search files.
  Everyone else is ignored (silently in groups).
- **No dependencies** — plain JavaScript on Workers, tested with Node's
  built-in test runner.

## How it works

```
/start → menu → category → tool link (opens in the browser)
@erffanhubbot report → inline results → tap to send the file
file sent to the storage group → indexed in D1 → searchable inline
```

The bot is a single Worker. Telegram sends updates to `/webhook`; the Worker
answers with the Bot API. `tools.json` is bundled with the Worker at deploy
time, so editing a tool is a data change, not a code change.

## Quickstart

Requires Node 18+ and a Cloudflare account.

```bash
npm install
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars` with the secrets from [Configuration](#configuration),
then run locally:

```bash
npm run dev
```

### Database

Create the D1 database once and apply the schema:

```bash
npx wrangler d1 create erffanhub-bot-files
```

Copy the `database_id` from the output into `wrangler.toml`, replacing
`DATABASE_ID_HERE`, then apply the migration:

```bash
npx wrangler d1 migrations apply erffanhub-bot-files
```

If you already have a D1 database, put its id in `wrangler.toml` instead of
creating a new one. The migration is idempotent (`IF NOT EXISTS`), so it is
safe to run on an existing database.

Then finish the [one-time setup](#one-time-setup): register the webhook and
the command menu.

## Configuration

All secrets are set in the Cloudflare Dashboard under **Workers & Pages →
Your Worker → Settings → Variables and Secrets**. Each one must be added
with **Type: Secret**. Locally, the same names go in `.dev.vars` (never
committed).

| Name | Required | Description |
|------|----------|-------------|
| `BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `WEBHOOK_SECRET` | Yes | Random string used to verify incoming requests. Without it the webhook returns 403 |
| `OWNER_TELEGRAM_ID` | Yes | Numeric Telegram user ID of the bot owner |
| `STORAGE_GROUP_ID` | Yes | Numeric chat ID of the group whose files are indexed |

`wrangler.toml` holds the non-secret config: the Worker name, the entry point
(`src/index.js`), and the D1 binding (`DB` → database `erffanhub-bot-files`).

## Deploy

There is no automatic deploy on git push. Deploy manually from the project
folder:

```bash
npx wrangler deploy
```

## One-time setup

**1. Register the webhook.** Open this URL once in a browser (replace the
placeholders):

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<worker-url>/webhook&secret_token=<WEBHOOK_SECRET>
```

**2. Register the command menu.**

```bash
curl -H "X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>" https://<worker-url>/setup-commands
```

**3. Verify the command menu.**

```bash
curl -H "X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>" https://<worker-url>/get-commands
```

Both admin endpoints require the webhook secret and return Telegram's real
response, including its status code.

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Open the main menu |
| `/help` | Show help |
| `/about` | About the owner |
| `/links` | Social links |

Commands also work with the bot name attached (`/start@erffanhubbot`) and
with arguments (`/start anything`).

### Inline search

In any chat, type the bot username and a file name:

```
@erffanhubbot report
@erffanhubbot invoice | pdf
```

The `| type` suffix filters by extension (`pdf`, `jpg`, `png`, `mp3`, `mp4`,
`zip`, `doc`, `docx`, `txt`, `gif`, `webp`). An unknown type is ignored.
Results are personal to the owner (`is_personal: true`) and cached for 30
seconds.

### Saving files

Send a file (document, video, audio, or photo) to the storage group. The bot
saves it to D1 and replies `✅ Saved: <name>`. Rules:

- Only files from the storage group, sent by the owner, are saved.
- The same file is never saved twice (dedup by `file_id`).
- A `#hashtag` in the caption becomes the file's category.
- Photos are saved as `.jpg` files; files without a name get a name derived
  from their file id, with the extension taken from the MIME type when needed.

## Managing tools

All tools and categories live in `src/tools.json`. To add, edit, or remove a
tool, only this file needs to change — the bot code does not need to be
touched. The file is validated at startup: unknown categories, duplicate ids,
and non-`https://` urls fail the deploy instead of shipping a broken menu.

### Full example

```json
{
  "categories": [
    { "id": "dev", "name": "Dev Tools", "emoji": "🛠️" },
    { "id": "text", "name": "Text Tools", "emoji": "📝" }
  ],
  "tools": [
    {
      "id": "website-erffan",
      "category": "dev",
      "name": "Website Erffan",
      "description": "Personal website",
      "url": "https://website-erffan.erffanhub.workers.dev/"
    },
    {
      "id": "website-status",
      "category": "dev",
      "name": "Website Status",
      "description": "Check website availability",
      "url": "https://erffanhub-00.github.io/Website-Status-Checker/"
    }
  ]
}
```

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `categories[].id` | Yes | Unique, short identifier. Used in menu callbacks, so do not change it after publishing |
| `categories[].name` | Yes | Display name shown in the main menu |
| `categories[].emoji` | No | Optional emoji prefix shown before the name |
| `tools[].id` | Yes | Unique identifier |
| `tools[].category` | Yes | Must exactly match one of `categories[].id` |
| `tools[].name` | Yes | Display name shown on the tool button |
| `tools[].url` | Yes | Full URL. Must start with `https://` |
| `tools[].description` | No | Short description. Reserved for future use, not shown yet |

### Common tasks

**Add a new category** — append an object to `categories`:

```json
{ "id": "image", "name": "Image Tools", "emoji": "🖼️" }
```

**Add a new tool** — append an object to `tools`. The `category` must match
an existing category `id`:

```json
{
  "id": "png-compress",
  "category": "image",
  "name": "PNG Compressor",
  "description": "Compress PNG images",
  "url": "https://tinypng.com"
}
```

**Move a tool between categories** — change only its `category` field.

**Remove a tool** — delete its object from the `tools` array.

**Remove a category** — first remove or move its tools, then delete the
category object. If any tool still points to a removed category, the Worker
fails to start with an error.

**Change display order** — the menu order matches the JSON array order. Move
objects up or down to reorder categories or tools.

**Rename a category or tool** — change only the `name` field. Do not change
`id`: it is used in callback data, and changing it breaks open menus.

## Project structure

```
├── wrangler.toml          # Workers config and D1 binding
├── package.json           # Scripts and dev dependencies
├── LICENSE
├── CHANGELOG.md
├── .dev.vars.example      # Placeholder secrets for local dev
├── README.md
├── migrations/
│   └── 0001_schema.sql    # D1 schema: files table + FTS5 index and triggers
├── src/
│   ├── index.js           # Worker entry point: routing and admin endpoints
│   ├── bot.js             # Update routing, commands, button presses
│   ├── inline.js          # Inline file search
│   ├── files.js           # File indexing into D1
│   ├── menu.js            # Keyboards and menu texts
│   ├── tools.js           # tools.json loading and validation
│   ├── commands.js        # Command list (single source of truth)
│   ├── auth.js            # Owner check
│   ├── telegram.js        # Telegram Bot API client
│   ├── about.js           # Owner info and social links
│   └── tools.json         # Tools and categories data
└── test/
    ├── helpers.js         # Fake D1 and fetch stub for tests
    ├── menu.test.js       # Menu building and tools.json checks
    ├── tools.test.js      # tools.json validation rules
    ├── bot.test.js        # Owner gate, commands, callbacks, file saving
    ├── inline.test.js     # Inline search parsing and results
    └── webhook.test.js    # Webhook secret checks and admin endpoints
```

## Development

```bash
npm test       # run the test suite (Node's built-in runner, no dependencies)
npm run check  # syntax-check every source file
npm run dev    # run the Worker locally with wrangler
```

Tests use a fake D1 and a stubbed `fetch`, so they run offline and never
touch Telegram or Cloudflare.

## Security notes

- The bot only responds to the owner. Messages from other users are ignored,
  silently in groups.
- The webhook and both admin endpoints require `WEBHOOK_SECRET` and return
  403 without it.
- The bot token is read only from `env.BOT_TOKEN` and is never written to
  logs. The webhook secret is compared, never logged.
- Inline search input is escaped before it reaches the FTS5 `MATCH`
  expression, so a search term cannot break or escape the query.
- The webhook handler always returns `200 OK` to Telegram, even on malformed
  updates, to avoid retry floods.

## License

MIT — see [LICENSE](LICENSE).

---

## Me
[![Telegram](https://img.shields.io/badge/Telegram-erffan__hub-blue?style=for-the-badge&logo=telegram)](https://t.me/erffan_hub)
[![Twitter](https://img.shields.io/badge/Twitter-@Erffanhub__00-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Erffanhub_00)
[![Gist](https://img.shields.io/badge/Gist-Profile-000000?style=for-the-badge&logo=github)](https://gist.github.com/erffanhub-00)
[![Github](https://img.shields.io/badge/Github-Profile-000000?style=for-the-badge&logo=github)](https://github.com/erffanhub-00)
