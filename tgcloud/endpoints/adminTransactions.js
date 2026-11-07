// Dashboard: wallet transaction ledger, newest first, searchable by
// username, user id, kind, status or file id. 20 rows per page.
// Owner-only. Rows are never deleted — money history stays.
import { requireOwner, pageParams, searchPage } from '../lib/admin.js';
import { searchTransactions } from '../lib/pure.js';
import { listTransactions } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const { q, page } = pageParams(input);
  return searchPage(await listTransactions(), q, page, searchTransactions);
}
