import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { settings, drafts } from '../schema.js';
import { isOwner } from '../lib/auth.js';
import { callWorker } from '../lib/worker.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

async function getSetting(key) {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? row.value : null;
}

// Draft shape the Worker expects for /schedule.
function draftPayload(draft) {
  return {
    id: draft.id,
    title: draft.title,
    body: draft.body,
    media_url: draft.media_url || undefined,
    source_url: draft.source_url || undefined,
    button_text: draft.button_text || undefined,
    button_url: draft.button_url || undefined,
  };
}

// Schedule a draft for a future publish. input: { id, publish_at }
// with publish_at as epoch ms UTC. Returns { ok: true, publish_at }.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const id = Number(input && (input.id ?? input.draft_id ?? input.feed_id));
    const publishAt = Number(input && input.publish_at);
    if (!Number.isInteger(id) || !Number.isFinite(publishAt)) {
      throw new Error('invalid_input');
    }
    if (publishAt <= Date.now()) throw new Error('invalid_time');
    const draft = await db.select().from(drafts).where(eq(drafts.id, id)).get();
    if (!draft) throw new Error('draft_not_found');
    const channelId = await getSetting('channel_id');
    if (!channelId) throw new Error('no_channel');
    const res = await callWorker('/schedule', {
      draft: draftPayload(draft),
      channel_id: Number(channelId),
      publish_at: publishAt,
    });
    if (!res || res.ok !== true) throw new Error('schedule_failed');
    await db
      .update(drafts)
      .set({ status: 'scheduled', publish_at: publishAt })
      .where(eq(drafts.id, draft.id))
      .run();
    return { ok: true, publish_at: publishAt };
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    if (
      err &&
      [
        'invalid_input',
        'invalid_time',
        'draft_not_found',
        'no_channel',
        'schedule_failed',
      ].includes(err.message)
    ) {
      throw err;
    }
    throw new Error('schedule_failed');
  }
}
