import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { drafts } from '../schema.js';
import { isOwner } from '../lib/auth.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Replace a draft's body. input: { id, body }. Returns the updated draft.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const id = Number(input && (input.id ?? input.draft_id ?? input.feed_id));
    const body = input && typeof input.body === 'string' ? input.body : null;
    if (!Number.isInteger(id) || body === null) throw new Error('invalid_input');
    const draft = await db.select().from(drafts).where(eq(drafts.id, id)).get();
    if (!draft) throw new Error('draft_not_found');
    await db.update(drafts).set({ body }).where(eq(drafts.id, id)).run();
    const updated = await db.select().from(drafts).where(eq(drafts.id, id)).get();
    return updated;
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    if (err && ['invalid_input', 'draft_not_found'].includes(err.message)) throw err;
    throw new Error('edit_draft_failed');
  }
}
