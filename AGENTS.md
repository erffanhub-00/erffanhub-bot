# AGENTS.md — ErffanHub Files v2 (v2.0.0)

## Layout

- `tgcloud/` — Telegram Serverless bot only: SQLite database,
  handlers, shared code. No `endpoints/`, no Mini App, no Worker.
- `tgcloud/handlers/` — `message.js` (private chat + DB group +
  receipts group), `callback_query.js` (all buttons). No other handlers.
- `tgcloud/lib/` — `config.js` (ids, urls, socials, card number —
  placeholders in the repo), `auth.js` (owner gate), `pure.js`
  (testable helpers), `format.js`, `keyboards.js`, `views.js`,
  `store.js` (DB helpers), `library.js` (force-join, search, stats,
  wallet, receipt settlement), `github.js` (live fetch + cache).

## Rules

- Bot-only on Telegram Serverless. No Cloudflare Worker, no D1, no KV.
- Public bot, but the DB group, the receipts group and `/stats` are
  owner-only (`OWNER_TELEGRAM_ID`). The bot ignores everyone else in
  those groups.
- Force-join: channel + public group, checked with `getChatMember`
  on `/start`, every file request and every content button. The bot
  must be admin in the channel and a member in both groups. A `0` id
  in config means "not configured yet" — that check is skipped.
- Navigation (v2): delete + resend. Every screen is shown by deleting
  the previous screen message and sending a fresh one at the bottom of
  the chat (the stored screen id lives in settings: `screen:<userId>`
  for private chat, `screen_db:<ownerId>` for the DB group). The
  user's own command/text messages are deleted after handling
  (best-effort; Telegram forbids deleting messages older than 48h).
  Delivered files are new messages and stay. Receipts-group messages
  are records and are never auto-deleted — except rejected receipts,
  which are deleted when the owner rejects them.
- Buttons: every screen ends the same way — content rows, pager row
  when paging, a generic «◀ بازگشت» row, then «🏠 منوی اصلی». The
  back button is always generic, never named after the previous
  screen. DB-group screens have no main-menu row; their back button
  (`db:cls`) just closes the screen.
- Pagination is 5 per page everywhere, including the DB-group `/list`
  (its pager buttons work now — the callback handler routes file
  browsing actions inside the DB group too).
- File ids: auto-sequential `F001`, `F002`… (counter in settings).
  The bot NEVER asks for a file number. Users request by the auto
  id (`F001`) or by name search.
- File categories: the owner picks a category at ingest (buttons
  with the existing categories + «دسته جدید», default «سایر»);
  users browse 📁 فایل‌ها by category first, then «همه فایل‌ها».
  `/setcat <ID> <category>` in the DB group changes a category
  later. Search matches title, description, category and file name.
- The original Telegram `file_name` is stored and delivered VERBATIM.
  The owner's title is a separate display label; the file view shows
  both. Never rename a file.
- File metadata (file_id, name, size, type, dimensions, duration) is
  extracted automatically on ingest — the owner is only ever asked
  for title + description + category + price (a version note on update).
- Prices (v2): a file is premium when `files.price > 0` (Toman);
  0 = free. The owner picks free/premium after the title, then types
  the price. `/setprice <ID> <amount>` (0 = free) changes it later.
  Updates keep the old price. Old files stay free.
- Wallet (v2): `users.balance` in Toman. A premium download checks
  the balance FIRST: insufficient → the file is remembered
  (`pending_purchase`) and the user is shown the top-up screen.
  Payment happens at delivery time (in `deliverPending` or the
  direct download path), never before. Purchases are recorded in
  `wallet_transactions` (kind 'purchase', negative amount, status
  'approved'). The balance never goes below zero.
- Top-ups (v2): the user taps «💳 شارژ کیف پول», sees `CARD_NUMBER`
  (filled by the owner in config.js — never in chat), picks a preset
  amount (50k/100k/200k/500k) or types one, then sends a receipt
  photo. The bot copies the photo into the receipts group with
  ✅ تایید / ❌ رد buttons and records a pending 'charge'
  transaction (found later by its receipts-group message id).
  Approve credits the wallet, marks the receipt ✅ (message stays as
  a permanent record), notifies the user, and auto-delivers a pending
  premium purchase when the balance now covers it. Reject notifies
  the user and DELETES the receipt message. Settlement is idempotent
  (a decided receipt answers "already decided" and moves no money).
  Manual fallback: `/rx <messageId> ok|no` in the receipts group.
  Transaction rows are never deleted — money history stays.
- User data is automatic and never asked for: everything Telegram
  already provides (id, username, name, language, is_premium) plus
  first/last activity, force-join status and downloads, in the
  `users` table (upsert on every interaction). The ONE exception is
  the phone number: on download, a user who never shared a phone is
  offered a native share-contact button («📱 ارسال شماره تلفن
  (اختیاری)», `request_contact`) plus «ادامه بدون شماره». The phone
  is optional — the file is ALWAYS delivered either way, and a user
  who shared once is never asked again. The phone is stored in
  `users.phone` and shown ONLY in the owner-only `/stats`. The bot
  never requests location and never asks for any other personal info.
- Owner notify (v2): `/stats` has «📣 اطلاع‌رسانی به همه» (type the
  text, confirm the user count, the bot sends it to every user) and,
  on each user profile, «📩 پیام به این کاربر». User search in
  `/stats` («🔍 جستجوی کاربر») matches name, username or id.
- Versions: a file row holds the latest version; old versions stay in
  `file_versions` + `file_parts` and are retrievable; latest is the
  default. `/update` keeps the id; «همون» keeps the old description.
- GitHub projects are fetched live (public API, no token) and cached
  in `github_cache`. A failed fetch shows the cached list with its
  date; the bot never fails `/start` because of GitHub.
- Persian RTL UI. Clean code, no emoji/banner decoration in code, no
  TODOs, no dead code. Schema: 8 tables (settings, files,
  file_parts, file_versions, downloads, users, github_cache,
  wallet_transactions), no foreign keys. `files` has `category` and
  `price` columns; `users` has nullable `phone` and `balance`
  columns. Do not change `tgcloud/schema.js` without a migration plan.
- Pending owner/user input lives in `settings` keys (`pending_*`),
  same pattern as the erffanhub-bot builds.

## Deploy

1. BotFather: new bot → Serverless on → CLI token
   (`app<id>:<secret>`, NOT the API token).
2. Create channel + public group + private DB group + private
   receipts group; bot admin in the channel, DB group and receipts
   group (delete rights, so it can clean up), member in the public
   group.
3. Fill `tgcloud/lib/config.js` (placeholders in the repo):
   `OWNER_TELEGRAM_ID`, `CHANNEL_ID`, `GROUP_ID`, `DB_GROUP_ID`,
   `RECEIPTS_GROUP_ID`, `CHANNEL_URL`, `GROUP_URL`, `CARD_NUMBER`.
4. `npx tgcloud login`, `npx tgcloud push`, `npx tgcloud migrate`.

## Test

```sh
npm test      # node --test "test/*.test.js"
npm run check # node --check on every source file
```
