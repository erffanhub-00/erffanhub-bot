// Dashboard: full database dump as JSON (every table). The
// front-end downloads it as a file. Owner-only.
import { requireOwner } from '../lib/admin.js';
import { exportDatabase } from '../lib/store.js';

export default async function (input, ctx) {
  requireOwner(ctx);
  return exportDatabase();
}
