// Dashboard: approve or reject a top-up receipt by its
// receipts-group message id — the same settlement as the ✅/❌
// buttons in the receipts group (credits the wallet, notifies the
// user, auto-delivers a pending premium purchase). Idempotent: a
// decided receipt answers "already decided" and moves no money.
// Owner-only.
import { EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { settleReceipt } from '../lib/library.js';
import { getTransactionByReceiptMessage } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const tx = await getTransactionByReceiptMessage(input?.messageId);
  if (!tx) throw new EndpointError('receipt not found');
  const res = await settleReceipt(tx, input?.approve === true);
  return { status: res.status };
}
