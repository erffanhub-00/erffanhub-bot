// Shared helpers for the owner's dashboard endpoints (tgcloud/
// endpoints/admin*.js). Every dashboard endpoint is owner-only: the
// platform already verified the Mini App init data before the
// endpoint runs, and requireOwner() checks the caller's id a second
// time. Tables page at 20 rows — the dashboard is a table UI, not
// the bot's 5-per-page chat UI.

import { EndpointError } from 'sdk';
import { isOwner } from './auth.js';
import { paginate } from './pure.js';

export const ADMIN_PAGE_SIZE = 20;

export function requireOwner(ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
  return ctx.initData.user;
}

// Clean { q, page } from an endpoint input: page is clamped to >= 0,
// q is trimmed.
export function pageParams(input) {
  const q = String(input?.q ?? '').trim();
  const page = Math.max(0, Number(input?.page) || 0);
  return { q, page };
}

// Search (when q is given) then paginate a pre-sorted list.
// `search` is one of the pure search helpers (searchUsers,
// searchFiles, searchTransactions) or null for no search.
export function searchPage(rows, q, page, search) {
  const list = q && search ? search(rows, q) : rows;
  return { ...paginate(list, page, ADMIN_PAGE_SIZE), total: list.length };
}
