// Dashboard: set a user's wallet balance by hand. The signed delta
// is written to the ledger as kind 'adjust', so money history stays
// auditable — the same rule as the bot's manual fix. Owner-only.
import { EndpointError } from 'sdk';
import { requireOwner } from '../lib/admin.js';
import { getUser, getUserBalance, setUserBalance, insertTransaction } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const user = await getUser(input?.userId);
  if (!user) throw new EndpointError('user not found');
  const oldBalance = await getUserBalance(user.user_id);
  const next = await setUserBalance(user.user_id, input?.balance);
  const delta = next - oldBalance;
  if (delta !== 0) {
    await insertTransaction({
      userId: user.user_id,
      username: user.username,
      kind: 'adjust',
      amount: delta,
      status: 'approved',
    });
  }
  return { userId: user.user_id, balance: next };
}
