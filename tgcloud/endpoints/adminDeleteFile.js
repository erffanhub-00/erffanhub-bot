// Dashboard: delete a file and all its parts, versions and
// download rows (same as /del in the DB group). The Telegram
// messages in the DB group stay — harmless. Owner-only.
import { EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { getFile, deleteFile } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const file = await getFile(input?.fileId);
  if (!file) throw new EndpointError('file not found');
  await deleteFile(file.id);
  return { ok: true, id: file.id };
}
