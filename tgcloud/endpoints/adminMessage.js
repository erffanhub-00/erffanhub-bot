// Dashboard: send a text message to one user. Owner-only.
import { api, EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { getUser } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const user = await getUser(input?.userId);
  if (!user) throw new EndpointError('user not found');
  const text = String(input?.text || '').trim();
  if (!text) throw new EndpointError('empty message');
  try {
    await api.sendMessage({ chat_id: user.user_id, text });
  } catch {
    throw new EndpointError('send failed — the user may have blocked the bot');
  }
  return { ok: true };
}
