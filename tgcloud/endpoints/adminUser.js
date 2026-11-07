// Dashboard: one user — profile, download history and wallet
// transactions. Owner-only.
import { EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { getUser, getUserDownloads, listUserTransactions } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const user = await getUser(input?.userId);
  if (!user) throw new EndpointError('user not found');
  return {
    user,
    downloads: (await getUserDownloads(user.user_id)).slice(0, 50),
    transactions: (await listUserTransactions(user.user_id)).slice(0, 50),
  };
}
