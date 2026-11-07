import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { settings, drafts, publish_log } from '../schema.js';
import { isOwner } from '../lib/auth.js';
import { callWorker } from '../lib/worker.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

async function getSetting(key) {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? row.value : null;
}

// Draft shape the Worker expects for /publish.
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

// Publish a draft to the channel right now, via the Worker. input: { id }.
// On success the draft becomes published and the publish is logged.
// Returns { message_id }. On Worker failure nothing is marked published.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const id = Number(input && (input.id ?? input.draft_id ?? input.feed_id));
    if (!Number.isInteger(id)) throw new Error('invalid_id');
    const draft = await db.select().from(drafts).where(eq(drafts.id, id)).get();
    if (!draft) throw new Error('draft_not_found');
    const channelId = await getSetting('channel_id');
    if (!channelId) throw new Error('no_channel');
    const res = await callWorker('/publish', {
      draft: draftPayload(draft),
      channel_id: Number(channelId),
    });
    if (!res || res.ok !== true || !res.message_id) {
      throw new Error('publish_failed');
    }
    await db
      .update(drafts)
      .set({ status: 'published' })
      .where(eq(drafts.id, draft.id))
      .run();
    await db
      .insert(publish_log)
      .values({
        draft_id: draft.id,
        channel_id: Number(channelId),
        message_id: res.message_id,
        published_at: Date.now(),
      })
      .run();
    return { message_id: res.message_id };
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    if (
      err &&
      ['invalid_id', 'draft_not_found', 'no_channel', 'publish_failed'].includes(
        err.message,
      )
    ) {
      throw err;
    }
    throw new Error('publish_failed');
  }
}
