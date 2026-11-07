// Dashboard: one file — latest info, its versions and how many
// times each version was downloaded. Owner-only.
import { EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { getFile, getVersions, listDownloads } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const file = await getFile(input?.fileId);
  if (!file) throw new EndpointError('file not found');
  const downloads = (await listDownloads()).filter((d) => d.file_id === file.id);
  const perVersion = {};
  for (const d of downloads) perVersion[d.version] = (perVersion[d.version] || 0) + 1;
  return { file, versions: await getVersions(file.id), perVersion, downloads: downloads.slice(0, 50) };
}
