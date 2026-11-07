// Dashboard: clear download history or the GitHub cache (both
// with a confirm in the front-end). Files, users, balances and the
// money ledger are never wiped from here. Owner-only.
import { EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { clearDownloads, clearGithubCache } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  if (input?.target === 'downloads') {
    return { cleared: await clearDownloads() };
  }
  if (input?.target === 'cache') {
    await clearGithubCache();
    return { cleared: 1 };
  }
  throw new EndpointError('unknown target');
}
