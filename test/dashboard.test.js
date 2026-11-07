// Dashboard contract tests (v2.3.2 regression).
//
// The dashboard front-end (dashboard/app.js, browser JS) and the
// server endpoints (tgcloud/endpoints/admin*.js) must agree on the
// exact field names of every response. v2.3.0 shipped with the
// front-end reading `d.items` while the server sends `pageItems`
// (see lib/pure.js paginate) — so the users, files, transactions
// and support tabs all crashed with an error panel, and no test
// caught it because the front-end is never imported in node.
// These tests pin the agreement from both sides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paginate } from '../tgcloud/lib/pure.js';

const appJs = readFileSync(new URL('../dashboard/app.js', import.meta.url), 'utf8');
const adminFilesJs = readFileSync(
  new URL('../tgcloud/endpoints/adminFiles.js', import.meta.url),
  'utf8',
);

test('paginate names the page array pageItems (the dashboard reads d.pageItems)', () => {
  const d = paginate([{ id: 1 }, { id: 2 }, { id: 3 }], 0, 2);
  assert.equal(d.pageItems.length, 2);
  assert.equal(d.page, 0);
  assert.equal(d.totalPages, 2);
  assert.equal(d.total, 3);
  assert.ok(!('items' in d), 'paginate must not also expose items — one name only');
});

test('dashboard front-end reads d.pageItems, never d.items', () => {
  assert.match(appJs, /d\.pageItems/, 'front-end must read the paginated array as d.pageItems');
  assert.doesNotMatch(appJs, /\bd\.items\b/, 'd.items does not exist in any endpoint response');
});

test('adminFiles attaches a downloads count per file row', () => {
  assert.match(adminFilesJs, /listDownloads/, 'adminFiles must count downloads');
  assert.match(adminFilesJs, /downloads: perFile\[f\.id\] \|\| 0/, 'each file row carries downloads');
});
