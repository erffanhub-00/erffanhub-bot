# ErffanHub Files — v2.2.0

A public Telegram bot on **Telegram Serverless** (no server, no
Cloudflare Worker, no Mini App): a showcase + file library + wallet
for Erfan.

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
  user list, per-user download history). It also has user search
  (by name, username or id), a transactions list and a broadcast
  button («📣 اطلاع‌رسانی به همه») plus per-user messaging.
- **Premium files + wallet:** a file can be free or premium (price in
  Toman). The owner picks free/premium at ingest and types the price
  (`/setprice F001 50000` changes it later; 0 = free). A premium
  download is paid from the user's wallet balance, shown in the main
  menu. Top-ups are card-to-card: the user sees the owner's card
  number, picks an amount and sends a receipt photo. Receipts land
  in a separate private receipts group with ✅ تایید / ❌ رد buttons;
  approval credits the wallet (and auto-delivers a pending premium
  file), rejection notifies the user and deletes the receipt message.
  No monthly subscription — every premium file has its own price.
- **Anti-clutter:** every screen is shown by deleting the previous
  screen message and sending a fresh one at the bottom of the chat,
  so the active screen is always the last message. The user's own
  command/text messages are deleted after handling. Delivered files
  delete themselves 60 seconds after delivery (the caption says so)
  and one-off notices (wallet charged, receipt rejected) after 20
  seconds. Telegram Serverless has no timer, so deletion is swept
  two ways: lazily on every use of the bot, and on a real timer by
  the tiny Cloudflare Worker in `cleanup-worker/` (once a minute —
  see its README; if the platform ever refuses its signed call, the
  lazy sweep still applies). Every screen ends
  with a generic «◀ بازگشت» button and «🏠 منوی اصلی».
- **Support:** every user has «💬 پیام به پشتیبانی» in the main menu
  (and `/support`). Their message (text, photo or file) is forwarded
  to the owner, who answers from the «✏️ پاسخ» button; the reply is
  forwarded back to the user.
- **Owner admin:** «📣 اطلاع‌رسانی» in the main menu (audience:
  everyone, one file's downloaders, or one user); on a user profile,
  «💰 تغییر موجودی» sets the balance by hand (recorded in the ledger
  as a manual adjustment); «🗄️ مدیریت دیتابیس» in `/stats` shows row
  counts for all tables, downloads a full JSON backup, and clears
  download history / the GitHub cache.

## Setup

1. **BotFather:** create a NEW bot, open it → **Serverless** → turn
   it on. Get the CLI access token (Serverless → CLI Access → Access
   token). Its form is `app<id>:<secret>` — this is NOT the bot API
   token.
2. **Create the channel, the public group, the private DB group and
   the private receipts group.** Add the bot as **admin in the
   channel** (so it can check membership), as **admin in the DB group
   and the receipts group** (delete rights, so it can clean up) and
   as a **member in the public group**.
3. **Fill `tgcloud/lib/config.js`:** `OWNER_TELEGRAM_ID`,
   `CHANNEL_ID`, `GROUP_ID`, `DB_GROUP_ID`, `RECEIPTS_GROUP_ID`,
   `CHANNEL_URL`, `GROUP_URL`, `CARD_NUMBER`. Get the ids from
   @userinfobot / @getmyid_bot. The repo copy keeps placeholders
   (`0` / `''`) — never commit real ids or the card number.
4. **Deploy:**
   ```sh
   npm install
   npx tgcloud login        # paste the app<id>:<secret> token
   npx tgcloud push
   npx tgcloud migrate      # creates settings, files, file_parts,
                            # file_versions, downloads, users, github_cache,
                            # wallet_transactions, expiring_messages
                            # (+ price/balance columns)
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
- `/wallet` — wallet balance, top-up and my transactions
- `/support` — message the owner (support)
- `/stats` — owner-only stats (files + users + wallet + notify + database)
- `/help` — help

DB group (owner only):

- `/bundle` — start a multi-part bundle, `/done` to finish it
- `/update F001` — new version of a file
- `/setcat F001 <category>` — change a file's category
- `/setprice F001 50000` — change a file's price (0 = free)
- `/del F001` — delete a file (with confirm)
- `/list` — list all files
- `/cancel` — cancel a pending input

Receipts group (owner only):

- `/rx <messageId> ok|no` — approve or reject a receipt by its message
  number (fallback for the ✅ / ❌ buttons)

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
