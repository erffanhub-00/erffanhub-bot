// Dashboard: top-up receipts waiting for a decision. Each row
// carries its receipts-group message id — the approve/reject
// buttons settle it. Owner-only.
import { requireOwner } from '../lib/admin.js';
import { getPendingReceipts, getUser } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const pending = await getPendingReceipts();
  const rows = [];
  for (const tx of pending) {
    const user = tx.user_id ? await getUser(tx.user_id) : null;
    rows.push({ ...tx, user });
  }
  return { rows };
}
