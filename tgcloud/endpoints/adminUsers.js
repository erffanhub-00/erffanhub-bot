// Dashboard: user table, newest activity first, searchable by name,
// username or id. 20 rows per page. Owner-only.
import { requireOwner, pageParams, searchPage } from '../lib/admin.js';
import { searchUsers } from '../lib/pure.js';
import { listUsers, listDownloads } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const { q, page } = pageParams(input);
  const users = await listUsers();
  const downloads = await listDownloads();
  const perUser = {};
  for (const d of downloads) {
    if (!d.user_id) continue;
    perUser[d.user_id] = (perUser[d.user_id] || 0) + 1;
  }
  const rows = users.map((u) => ({ ...u, downloads: perUser[u.user_id] || 0 }));
  return searchPage(rows, q, page, searchUsers);
}
