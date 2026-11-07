import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { drafts } from '../schema.js';
import { isOwner } from '../lib/auth.js';
import { callWorker } from '../lib/worker.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Cancel a scheduled draft. input: { id }. The draft goes back to draft
// status and its publish time is cleared. Returns { ok: true }.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const id = Number(input && (input.id ?? input.draft_id ?? input.feed_id));
    if (!Number.isInteger(id)) throw new Error('invalid_id');
    const draft = await db.select().from(drafts).where(eq(drafts.id, id)).get();
    if (!draft) throw new Error('draft_not_found');
    const res = await callWorker('/schedule/cancel', { draft_id: id });
    if (!res || res.ok !== true) throw new Error('cancel_failed');
    await db
      .update(drafts)
      .set({ status: 'draft', publish_at: null })
      .where(eq(drafts.id, draft.id))
      .run();
    return { ok: true };
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    if (err && ['invalid_id', 'draft_not_found', 'cancel_failed'].includes(err.message)) {
      throw err;
    }
    throw new Error('cancel_failed');
  }
}
