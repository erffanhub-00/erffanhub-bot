import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { drafts } from '../schema.js';
import { isOwner } from '../lib/auth.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Drafts, newest first, at most 50 rows. input: { status? }
// status is one of draft | scheduled | published | discarded.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const status = input && typeof input.status === 'string' ? input.status : null;
    const rows = status
      ? await db.select().from(drafts).where(eq(drafts.status, status)).all()
      : await db.select().from(drafts).all();
    rows.sort((a, b) => b.id - a.id);
    return rows.slice(0, 50);
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    throw new Error('list_drafts_failed');
  }
}
