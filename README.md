# ErffanHub Files — v1.0.0

A public Telegram bot on **Telegram Serverless** (no server, no
Cloudflare Worker, no Mini App): a showcase + file library for Erfan.

- **Force-join:** the bot is connected to his channel and a public
  group. On `/start` it checks membership in both; until the user
  joins, the menu stays locked.
- **GitHub projects:** `/projects` fetches his public repos live from
  the GitHub API (name, description, language, stars, link), cached in
  SQLite so it still works when GitHub is down.
- **Socials:** Telegram, X and GitHub links (editable in
  `tgcloud/lib/config.js`).
- **File library:** a private DB group (only the owner + the bot) is
  the database. The owner sends a file there, the bot gives it an
  auto ID (`F001`, `F002`…) and asks for a title + description +
  category in the same group. Users find files by browsing
  categories, by ID (`F001`) or by name search, and the bot forwards
  the file to them (the original Telegram `file_id` — nothing is
  re-uploaded, the original file name is never changed).
- **Categories:** at ingest the owner picks a category (existing
  categories as buttons, or «دسته جدید» to create one; skipped →
  «سایر»). Users browse 📁 فایل‌ها by category first. `/setcat F001
  <category>` in the DB group changes a category later. Search also
  matches the category.
- **Multi-part files:** `/bundle` → send the parts → `/done` → one ID
  for the whole bundle.
- **Versions:** `/update F001` + a new file → version v2; old versions
  stay retrievable, latest is the default.
- **User data (automatic, never asked):** everything Telegram already
  gives the bot — user id, username, name, language, is_premium,
  first seen, last active, force-join status, downloads — is stored in
  the `users` table. The bot never asks a user for personal info.
  The ONE exception: on download, a user who never shared a phone is
  offered an optional native share-contact button («📱 ارسال شماره
  تلفن (اختیاری)») plus «ادامه بدون شماره». The phone is never
  required — the file is always delivered, and a user who shared once
  is never asked again. The phone is visible only in the owner-only
  `/stats`.
- **Owner stats:** `/stats` (owner only) shows file stats (per-file
  downloads, last downloaded) and user stats (totals, new users,
  user list, per-user download history).
- **Anti-clutter:** all navigation happens in ONE message edited in
  place. The only new messages are the delivered files themselves.

## Setup

1. **BotFather:** create a NEW bot, open it → **Serverless** → turn
   it on. Get the CLI access token (Serverless → CLI Access → Access
   token). Its form is `app<id>:<secret>` — this is NOT the bot API
   token.
2. **Create the channel, the public group and the private DB group.**
   Add the bot as **admin in the channel** (so it can check
   membership) and as a **member in both groups**.
3. **Fill `tgcloud/lib/config.js`:** `OWNER_TELEGRAM_ID`,
   `CHANNEL_ID`, `GROUP_ID`, `DB_GROUP_ID`, `CHANNEL_URL`,
   `GROUP_URL`. Get the ids with `/id` after the first deploy, or
   from @userinfobot / @getmyid_bot. The repo copy keeps placeholders
   (`0` / `''`) — never commit real ids.
4. **Deploy:**
   ```sh
   npm install
   npx tgcloud login        # paste the app<id>:<secret> token
   npx tgcloud push
   npx tgcloud migrate      # creates settings, files, file_parts,
                            # file_versions, downloads, users, github_cache
   ```
5. **Try it:** `/start` in the bot. In the DB group, send a file and
   follow the bot's prompts.

## Commands

- `/start` — main menu (force-join checked first)
- `/projects` — GitHub projects
- `/socials` — social links
- `/files` — browse the file library (categories first)
- `/get F001` — open a file by id (bare `F001` also works)
- `/search` — search files by name (title, description, category, file name)
- `/stats` — owner-only stats (files + users)
- `/id` — this chat's id and your Telegram id
- `/help` — help

DB group (owner only):

- `/bundle` — start a multi-part bundle, `/done` to finish it
- `/update F001` — new version of a file
- `/setcat F001 <category>` — change a file's category
- `/del F001` — delete a file (with confirm)
- `/list` — list all files
- `/cancel` — cancel a pending input

## Test

```sh
npm test             # node --test "test/*.test.js"
npm run check        # node --check on every source file
```

## Me
[![Telegram](https://img.shields.io/badge/Telegram-erffan__hub-blue?style=for-the-badge&logo=telegram)](https://t.me/erffan_hub)
[![Twitter](https://img.shields.io/badge/Twitter-@Erffanhub__00-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Erffanhub_00)
[![Gist](https://img.shields.io/badge/Gist-Profile-000000?style=for-the-badge&logo=github)](https://gist.github.com/erffanhub-00)
[![Github](https://img.shields.io/badge/Github-Profile-000000?style=for-the-badge&logo=github)](https://github.com/erffanhub-00)
