import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { news_items, drafts } from '../schema.js';
import { isOwner } from '../lib/auth.js';
import { callWorker } from '../lib/worker.js';

function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
}

// Write a channel post from a news item with the AI writer and save it
// as a draft. input: { newsId }. Returns the created draft.
export default async function (input, ctx) {
  requireOwner(ctx);
  try {
    const newsId = Number(input && (input.newsId ?? input.news_item_id ?? input.id));
    if (!Number.isInteger(newsId)) throw new Error('invalid_id');
    const item = await db
      .select()
      .from(news_items)
      .where(eq(news_items.id, newsId))
      .get();
    if (!item) throw new Error('news_not_found');
    const res = await callWorker('/ai', {
      task: 'write_post',
      title: item.title,
      text: item.description || '',
      source_url: item.link,
    });
    if (!res || res.ok !== true || typeof res.text !== 'string') {
      throw new Error('ai_failed');
    }
    const rows = await db
      .insert(drafts)
      .values({
        kind: 'news',
        title: item.title,
        body: res.text,
        media_url: null,
        source_url: item.link,
        button_text: 'مشاهده خبر',
        button_url: item.link,
        news_item_id: item.id,
        status: 'draft',
        publish_at: null,
        created_at: Date.now(),
      })
      .returning()
      .run();
    if (!rows || !rows[0]) throw new Error('make_post_failed');
    await db
      .update(news_items)
      .set({ status: 'selected' })
      .where(eq(news_items.id, item.id))
      .run();
    return rows[0];
  } catch (err) {
    if (err && (err instanceof EndpointError || err.message === 'forbidden')) throw err;
    if (
      err &&
      ['invalid_id', 'news_not_found', 'ai_failed', 'make_post_failed'].includes(
        err.message,
      )
    ) {
      throw err;
    }
    throw new Error('make_post_failed');
  }
}
