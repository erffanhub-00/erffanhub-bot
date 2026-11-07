// Dashboard: answer a support message — sends the text to the user
// and marks the row answered. Owner-only.
import { api, EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { getSupportMessage, markSupportAnswered } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const row = await getSupportMessage(input?.messageId);
  if (!row) throw new EndpointError('message not found');
  const text = String(input?.text || '').trim();
  if (!text) throw new EndpointError('empty reply');
  try {
    await api.sendMessage({ chat_id: row.user_id, text });
  } catch {
    throw new EndpointError('send failed — the user may have blocked the bot');
  }
  await markSupportAnswered(row.id);
  return { ok: true };
}
