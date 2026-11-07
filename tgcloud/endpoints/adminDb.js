// Dashboard: row counts for every table. Owner-only.
import { requireOwner } from '../lib/admin.js';
import { getDbCounts } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  return { counts: await getDbCounts() };
}
