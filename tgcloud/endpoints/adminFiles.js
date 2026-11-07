// Dashboard: file table, newest first, searchable by title,
// description, category or file name. 20 rows per page. Owner-only.
import { requireOwner, pageParams, searchPage } from '../lib/admin.js';
import { searchFiles } from '../lib/pure.js';
import { listFiles } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const { q, page } = pageParams(input);
  return searchPage(await listFiles(), q, page, searchFiles);
}
