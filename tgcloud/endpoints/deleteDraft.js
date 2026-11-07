import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { drafts } from '../schema.js';
import { isOwner } from '../lib/auth.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Delete a draft. input: { id }. Returns { ok: true }.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const id = Number(input && (input.id ?? input.draft_id ?? input.feed_id));
    if (!Number.isInteger(id)) throw new Error('invalid_id');
    await db.delete(drafts).where(eq(drafts.id, id)).run();
    return { ok: true };
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    if (err && err.message === 'invalid_id') throw err;
    throw new Error('delete_draft_failed');
  }
}
