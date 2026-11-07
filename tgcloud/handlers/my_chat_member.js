import { db } from 'sdk';
import { eq } from 'sdk/db';
import { settings } from '../schema.js';

async function getSetting(key) {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? row.value : null;
}

async function setSetting(key, value) {
  const existing = await getSetting(key);
  if (existing === null) {
    await db.insert(settings).values({ key, value }).run();
  } else {
    await db.update(settings).set({ value }).where(eq(settings.key, key)).run();
  }
}

async function deleteSetting(key) {
  await db.delete(settings).where(eq(settings.key, key)).run();
}

// Tracks which channel the bot may publish to. When the bot becomes an
// administrator of a channel, the channel is remembered; when the bot is
// removed or kicked, the record is dropped. No reply is sent.
export default async function (update, ctx) {
  try {
    const chat = update.chat;
    const member = update.new_chat_member;
    if (!chat || !member) return;
    if (member.status === 'administrator' && chat.type === 'channel') {
      await setSetting('channel_id', String(chat.id));
      if (chat.title) await setSetting('channel_title', chat.title);
    } else if (member.status === 'left' || member.status === 'kicked') {
      await deleteSetting('channel_id');
      await deleteSetting('channel_title');
    }
  } catch {
    // Membership bookkeeping must never fail the update.
  }
}
