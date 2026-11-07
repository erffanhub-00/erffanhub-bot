# AGENTS.md — ErffanHub Files v1 (v1.0.0)

## Layout

- `tgcloud/` — Telegram Serverless bot only: SQLite database,
  handlers, shared code. No `endpoints/`, no Mini App, no Worker.
- `tgcloud/handlers/` — `message.js` (private chat + DB group),
  `callback_query.js` (all buttons). No other handlers.
- `tgcloud/lib/` — `config.js` (ids, urls, socials — placeholders in
  the repo), `auth.js` (owner gate), `pure.js` (testable helpers),
  `format.js`, `keyboards.js`, `views.js`, `store.js` (DB helpers),
  `library.js` (force-join, search, stats), `github.js` (live fetch +
  cache).

## Rules

- Bot-only on Telegram Serverless. No Cloudflare Worker, no D1, no KV.
- Public bot, but the DB group and `/stats` are owner-only
  (`OWNER_TELEGRAM_ID`). The bot ignores everyone else in the DB
  group.
- Force-join: channel + public group, checked with `getChatMember`
  on `/start`, every file request and every content button. The bot
  must be admin in the channel and a member in both groups. A `0` id
  in config means "not configured yet" — that check is skipped.
- One screen, edited in place: navigation edits the same message
  (`api.editMessageText`); commands send a single screen message.
  The only new messages are the delivered files themselves.
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
  for title + description (+ a version note on update).
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
- Versions: a file row holds the latest version; old versions stay in
  `file_versions` + `file_parts` and are retrievable; latest is the
  default. `/update` keeps the id; «همون» keeps the old description.
- GitHub projects are fetched live (public API, no token) and cached
  in `github_cache`. A failed fetch shows the cached list with its
  date; the bot never fails `/start` because of GitHub.
- Persian RTL UI. Clean code, no emoji/banner decoration in code, no
  TODOs, no dead code. Schema is minimal: 7 tables (settings, files,
  file_parts, file_versions, downloads, users, github_cache), no
  foreign keys. `files` has a `category` column and `users` has a
  nullable `phone` column. Do not change `tgcloud/schema.js` without
  a migration plan.
- Pending owner/user input lives in `settings` keys (`pending_*`),
  same pattern as the erffanhub-bot builds.

## Deploy

1. BotFather: new bot → Serverless on → CLI token
   (`app<id>:<secret>`, NOT the API token).
2. Create channel + public group + private DB group; bot admin in the
   channel, member in both groups.
3. Fill `tgcloud/lib/config.js` (placeholders in the repo).
4. `npx tgcloud login`, `npx tgcloud push`, `npx tgcloud migrate`.

## Test

```sh
npm test      # node --test "test/*.test.js"
npm run check # node --check on every source file
```
