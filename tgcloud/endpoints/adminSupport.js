// Dashboard: support inbox, newest first. 20 rows per page.
// Owner-only. Media is never stored — only the kind and the
// text/caption (the full message also arrives forwarded in Telegram).
import { requireOwner, pageParams, searchPage } from '../lib/admin.js';
import { listSupportMessages } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const { page } = pageParams(input);
  return searchPage(await listSupportMessages(), '', page, null);
}
