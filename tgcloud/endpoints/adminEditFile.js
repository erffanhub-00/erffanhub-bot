// Dashboard: edit a file's title, description, category and price.
// Only the fields sent are changed. Owner-only.
import { EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { updateFileMeta } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  if (!input?.fileId) throw new EndpointError('file id required');
  const file = await updateFileMeta(input.fileId, {
    title: input.title,
    description: input.description,
    category: input.category,
    price: input.price,
  });
  if (!file) throw new EndpointError('file not found');
  return { file };
}
