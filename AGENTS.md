# AGENTS.md — ErffanHub Files v2 (v2.4.0)

## Layout

- `tgcloud/` — Telegram Serverless bot only: SQLite database,
  handlers, shared code.
- `tgcloud/handlers/` — `message.js` (private chat + DB group +
  receipts group), `callback_query.js` (all buttons). No other handlers.
- `tgcloud/endpoints/` — `cleanup.js` (the timer endpoint, called by
  the Cloudflare Worker cron with the owner's signed init data) and
  `admin*.js` (the owner's dashboard endpoints — every one checks
  `requireOwner` first; see `lib/admin.js`).
- `dashboard/` — the owner's Mini App dashboard (plain HTML/CSS/JS,
  no build step), served at `https://app<id>.tgcloud.ai/` via
  `tgcloud.jsonc` `"static": { "source": "dashboard" }`. Opened from
  the «🖥️ داشبورد مدیریت» web_app button in the owner's main menu.
- `cleanup-worker/` — a Cloudflare Worker cron (once a minute) that
  calls the `cleanup` endpoint. Lives OUTSIDE `tgcloud/`, so
  `tgcloud push` never deploys it as bot code; it is deployed
  separately with `wrangler deploy`.
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
  Receipts-group messages are records and are never auto-deleted —
  except rejected receipts, which are deleted when the owner rejects
  them.
- Self-deleting messages (v2.1): delivered files delete themselves
  60s after delivery (`FILE_TTL_SEC`), one-off notices 20s after
  (`NOTICE_TTL_SEC`). The sweep (`runCleanup`, in `lib/library.js`)
  deletes the due rows of the `expiring_messages` table (best-effort)
  and drops the rows either way. The file caption tells the reader
  it will be deleted in 1 minute.
- The timer (v2.2): Telegram Serverless has NO timer or cron and
  endpoints are Mini-App-only, so expiry is swept three ways. (1)
  Lazily: both handlers call `runCleanup()` on every incoming
  update — this always works and is the fallback. (2) On a real
  timer: the `cleanup` endpoint (owner-only, `ctx.initData.user.id`
  must be the owner) runs the same sweep, and the Cloudflare Worker
  in `cleanup-worker/` calls it once a minute with the owner's
  signed init data — `Authorization: TMA <base64(initData)>`, the
  exact wire format of the Mini App SDK (read from
  telegram-web-app.js), HMAC-SHA256 per Telegram's validation spec
  (pinned by `test/worker.test.js`). The platform verifies the
  signature before the endpoint runs; if it ever refuses the call
  (401 — e.g. it also checks for a live Mini App session), the lazy
  sweep still applies and nothing breaks. The Worker needs
  `BOT_TOKEN` (BotFather API token, a Worker secret) and `OWNER_ID`
  (wrangler.toml var) — never commit either. (3) The dashboard
  (v2.3): while it is open it calls `cleanup` every 30s — a timer
  that needs no extra setup at all.
  There is no `/id` command: it was removed entirely at the owner's
  request (2026-11-07). Group ids come from @userinfobot /
  @getmyid_bot.
- Buttons: every screen ends the same way — content rows, pager row
  when paging, a generic «◀ بازگشت» row, then «🏠 منوی اصلی». The
  back button is always generic, never named after the previous
  screen. DB-group screens have no main-menu row; their back button
  (`db:cls`) just closes the screen.
- Persistent menu (v2.4): the main menu is a REPLY keyboard
  (`persistentKeyboard` in `lib/keyboards.js`, `is_persistent`),
  not an inline keyboard — it belongs to the chat, so it stays
  visible even after every message is deleted and the user never
  faces an empty chat with no way back except /start. Its button
  labels live once in `MENU_LABELS`; `handleMenuButton` in
  `handlers/message.js` routes the plain-text taps (before every
  text intake, like /commands) and re-checks force-join. After a
  phone-prompt download the main menu is shown again to restore
  the keyboard (the one-time contact keyboard hides it).
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
- Owner notify (v2.1): «📣 اطلاع‌رسانی» on the main menu (owner
  only) opens an audience picker — everyone, one file's downloaders
  (`getFileDownloaders`, bulk), or one user (search, then message).
  The `/stats` entry («📣 اطلاع‌رسانی به همه») still works and
  returns to stats; the return target rides in
  `pending_notify_return`. On each user profile, «📩 پیام به این
  کاربر». User search in `/stats` («🔍 جستجوی کاربر») matches name,
  username or id.
- Support (v2.1): «💬 پیام به پشتیبانی» in the main menu (and
  `/support`) sets `pending_support`; the user's next message (text,
  photo or file) is forwarded to the owner (`api.forwardMessage`,
  text fallback when forwarding fails) with an info line carrying a
  «✏️ پاسخ» button (`sp:rep:<userId>`). The owner's reply
  (`pending_support_reply`) is forwarded back to the user. A command
  cancels support/reply mode instead of being forwarded.
- Manual balance fix (v2.1): on a user profile, «💰 تغییر موجودی»
  (`st:bal:<userId>`) asks for the NEW balance; `setUserBalance`
  clamps at zero and the signed delta is recorded in
  `wallet_transactions` as kind 'adjust' (shown as «تغییر دستی»).
- Database management (v2.1): «🗄️ مدیریت دیتابیس» in `/stats`
  shows row counts for all 10 tables (`getDbCounts`), «💾 دانلود
  پشتیبان (JSON)» sends a full dump as a file (JSON built in memory,
  `new InputFile(bytes, name, { type: 'application/json' })` —
  no filesystem on Serverless), and confirm-guarded clears for
  download history (`clearDownloads`) and the GitHub cache
  (`clearGithubCache`). Files, users, balances and the money ledger
  are never wiped from here.
- Versions: a file row holds the latest version; old versions stay in
  `file_versions` + `file_parts` and are retrievable; latest is the
  default. `/update` keeps the id; «همون» keeps the old description.
- GitHub projects are fetched live (public API, no token) and cached
  in `github_cache`. A failed fetch shows the cached list with its
  date; the bot never fails `/start` because of GitHub.
- Dashboard (v2.3): plain HTML/CSS/JS in `dashboard/`, no bundler,
  Telegram theme variables so it looks native. Tabs: stats, users,
  files, transactions, receipts, support, broadcast, database.
  Tables page at 20 rows (`ADMIN_PAGE_SIZE` in `lib/admin.js`) and
  search with the pure `searchUsers`/`searchFiles`/
  `searchTransactions` helpers. The front-end reads paginated lists
  as `d.pageItems` — that is the field name `paginate` returns, and
  `test/dashboard.test.js` pins the agreement (v2.3.0 shipped with
  the front-end reading `d.items`, which does not exist, so the
  users/files/transactions/support tabs all crashed — fixed in
  v2.3.2). Support messages are stored in the
  new `support_messages` table (kind + text/caption only — no media
  bytes, no file ids, so nothing token-exposing ever leaves the
  server); the bot also forwards each one to the owner in Telegram
  as before. Every dashboard endpoint is owner-only
  (`requireOwner`); the front-end shows a "فقط مالک" panel on
  'forbidden'. Schema: 10 tables. The main menu has an owner-only
  web_app button («🖥️ داشبورد مدیریت», `DASHBOARD_URL` — a public
  URL kept as a constant in `lib/keyboards.js`, NOT in config.js:
  v2.3.0 imported it from config.js, the owner's real config.js
  never had that key, and the deploy failed to compile. Never add a
  new required export to config.js — the owner's file never receives
  it from a push).
- Persian RTL UI. Clean code, no emoji/banner decoration in code, no
  TODOs, no dead code. Schema: 10 tables (settings, files,
  file_parts, file_versions, downloads, users, github_cache,
  wallet_transactions, expiring_messages, support_messages), no
  foreign keys. `files` has `category` and `price` columns; `users`
  has nullable `phone` and `balance` columns. Do not change
  `tgcloud/schema.js` without a migration plan.
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
