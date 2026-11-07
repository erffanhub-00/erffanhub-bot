// Dashboard: overview numbers + the 10 newest transactions and
// downloads. Owner-only.
import { requireOwner } from '../lib/admin.js';
import { getStatsData } from '../lib/library.js';
import { listSupportMessages } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  const stats = await getStatsData();
  const unanswered = (await listSupportMessages()).filter((m) => !m.answered).length;
  return {
    filesTotal: stats.filesTotal,
    partsTotal: stats.partsTotal,
    sizeTotal: stats.sizeTotal,
    downloadsTotal: stats.downloadsTotal,
    usersTotal: stats.usersTotal,
    usersToday: stats.usersToday,
    usersWeek: stats.usersWeek,
    totalCharged: stats.totalCharged,
    totalPurchased: stats.totalPurchased,
    pendingReceipts: stats.pendingReceipts,
    unansweredSupport: unanswered,
    recentTransactions: stats.recentTransactions,
    recentDownloads: stats.recentDownloads,
  };
}
