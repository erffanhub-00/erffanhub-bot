// Dashboard: file table, newest first, searchable by title,
// description, category or file name. 20 rows per page. Owner-only.
// Each row carries its download count (the front-end shows it in
// the «دانلود» column — plain file rows have no such field).
import { requireOwner, pageParams, searchPage } from '../lib/admin.js';
import { searchFiles } from '../lib/pure.js';
import { listFiles, listDownloads } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const { q, page } = pageParams(input);
  const downloads = await listDownloads();
  const perFile = {};
  for (const d of downloads) {
    if (!d.file_id) continue;
    perFile[d.file_id] = (perFile[d.file_id] || 0) + 1;
  }
  const rows = (await listFiles()).map((f) => ({ ...f, downloads: perFile[f.id] || 0 }));
  return searchPage(rows, q, page, searchFiles);
}
