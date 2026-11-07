// Dashboard: send a notification. Audience: 'all' (every user),
// 'file' (only users who downloaded that file) or 'user' (one
// user). Same delivery as the bot's notify. Owner-only.
import { EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { getFileDownloaders, sendNotifyToUsers } from '../lib/library.js';
import { listUsers } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const text = String(input?.text || '').trim();
  if (!text) throw new EndpointError('empty message');
  let userIds;
  if (input?.audience === 'file') {
    if (!input?.fileId) throw new EndpointError('file id required');
    userIds = await getFileDownloaders(input.fileId);
  } else if (input?.audience === 'user') {
    if (!input?.userId) throw new EndpointError('user id required');
    userIds = [Number(input.userId)];
  } else {
    userIds = (await listUsers()).map((u) => u.user_id);
  }
  if (userIds.length === 0) return { ok: 0, fail: 0, total: 0 };
  const res = await sendNotifyToUsers(userIds, text);
  return { ok: res.ok, fail: res.fail, total: userIds.length };
}
