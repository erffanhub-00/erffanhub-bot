# Changelog

## Unreleased

- Restructured the codebase into focused modules: `src/auth.js` (owner check),
  `src/telegram.js` (Bot API client), `src/commands.js` (command list),
  `src/tools.js` (tools.json loading and validation), `src/files.js` (file
  indexing), plus slimmer `src/bot.js`, `src/inline.js`, and `src/index.js`.
- Commands are defined once in `src/commands.js` and reused by the command
  menu registration and the help text, so they cannot drift apart.
- Admin endpoints (`/setup-commands`, `/get-commands`) share one secret check
  and one Telegram proxy helper instead of duplicated fetch code.
- File names for photos and unnamed files are now derived from the file id
  instead of a timestamp; the extension falls back to the MIME type when the
  file has no name.
- Expanded the test suite from 5 to 43 tests: owner gate, commands, callbacks,
  file saving, inline search, webhook secret checks, and tools.json validation.
- Added `npm run check` (syntax check for every source file), `.dev.vars.example`,
  and this changelog. `package.json` now lists author, keywords, and engines.

## 1.0.0 — 2026-11-06

- Restored the owner gate: only the owner can use the bot or search files.
- Webhook secret is required: without it, or with a wrong secret, the webhook
  and the admin endpoints return 403.
- `/setup-commands` and `/get-commands` are protected by the webhook secret
  and return Telegram's real response.
- Added the D1 binding and `migrations/0001_schema.sql`, including the FTS5
  sync triggers so inline search finds newly saved files.
- `tools.json` is validated at startup (known categories, unique ids, https urls).
- Inline search escapes FTS5 syntax, uses short unique result ids, and logs
  query errors instead of reporting "No files found".
- File saving checks the sender, dedups by `file_id`, and also stores photos.
- README converted to UTF-8 and corrected; added MIT LICENSE, `package-lock.json`,
  and the first 5 tests.
